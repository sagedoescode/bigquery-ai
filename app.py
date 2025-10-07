from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from google.cloud import geminidataanalytics
from google.auth import default
from google.protobuf.json_format import MessageToDict
import proto
import os
import logging
import time
from config import Config

# Initialize Flask app
app = Flask(__name__)
app.config.from_object(Config)
CORS(app, origins=app.config.get('CORS_ORIGINS', '*'))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class BigQueryChatbot:
    def __init__(self, project_id, location, dataset_id):
        self.project_id = project_id
        self.location = location
        self.dataset_id = dataset_id
        self.table_id = app.config.get('BIGQUERY_TABLE_ID', None)
        self.data_chat_client = None
        self.data_agent_client = None
        self.data_agent_name = None
        self.initialize_client()

    def initialize_client(self):
        """Initialize Google Cloud clients and authenticate"""
        try:
            # Handle both service account and user authentication
            if 'CREDENTIALS_PATH' in app.config and app.config['CREDENTIALS_PATH']:
                os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = app.config['CREDENTIALS_PATH']
                logger.info("Using service account credentials")
            else:
                # For user authentication, remove service account credentials
                if 'GOOGLE_APPLICATION_CREDENTIALS' in os.environ:
                    del os.environ['GOOGLE_APPLICATION_CREDENTIALS']

                # Get default credentials (user auth)
                credentials, project = default()
                logger.info(f"Using user authentication. Project: {project}, Credentials type: {type(credentials)}")

            self.data_chat_client = geminidataanalytics.DataChatServiceClient()
            self.data_agent_client = geminidataanalytics.DataAgentServiceClient()
            logger.info("Google Cloud clients initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize Google Cloud clients: {e}")
            raise

    def _convert_proto_to_dict(self, v):
        """
        Convert Protocol Buffer objects to regular Python objects
        This is the helper function from Google's documentation
        """
        if isinstance(v, proto.marshal.collections.maps.MapComposite):
            return {k: self._convert_proto_to_dict(v[k]) for k in v.keys()}
        elif isinstance(v, proto.marshal.collections.RepeatedComposite):
            return [self._convert_proto_to_dict(el) for el in v]
        elif isinstance(v, (int, float, str, bool, type(None))):
            return v
        else:
            try:
                return MessageToDict(v)
            except Exception as e:
                logger.warning(f"Could not convert proto object to dict: {e}")
                return str(v)

    def create_data_agent(self, data_agent_id=None):
        """Create or get a data agent for BigQuery interactions"""
        try:
            # Generate unique agent ID with timestamp if none provided
            if not data_agent_id:
                timestamp = str(int(time.time()))
                data_agent_id = f"sales-agent-{timestamp}"

            parent = f"projects/{self.project_id}/locations/{self.location}"
            self.data_agent_name = f"{parent}/dataAgents/{data_agent_id}"

            # Check if agent already exists
            try:
                existing_agent = self.data_agent_client.get_data_agent(name=self.data_agent_name)
                logger.info(f"Data agent '{self.data_agent_name}' already exists. Using it.")
                return existing_agent
            except Exception:
                logger.info(f"Data agent '{self.data_agent_name}' not found. Creating a new one.")

            # Create BigQuery data source reference (REQUIRED)
            bigquery_table_reference = geminidataanalytics.BigQueryTableReference()

            # Use the configured table if available, otherwise use public dataset for testing
            if self.table_id:
                bigquery_table_reference.project_id = self.project_id
                bigquery_table_reference.dataset_id = self.dataset_id
                bigquery_table_reference.table_id = self.table_id
                logger.info(f"Using configured BigQuery table: {self.project_id}.{self.dataset_id}.{self.table_id}")
            else:
                # Fallback to public dataset for testing
                bigquery_table_reference.project_id = "gen-lang-client-0691935742"
                bigquery_table_reference.dataset_id = "accountstable"
                bigquery_table_reference.table_id = "salestable"
                logger.info("Using public BigQuery dataset for testing: bigquery-public-data.samples.shakespeare")

            # Create datasource references (REQUIRED - this was missing in original code)
            datasource_references = geminidataanalytics.DatasourceReferences()
            datasource_references.bq.table_references = [bigquery_table_reference]

            # Set up published context with datasource references
            published_context = geminidataanalytics.Context()
            base_instruction = """You are a helpful data analyst assistant. 
                Analyze data from BigQuery tables and provide clear, accurate insights.

                IMPORTANT FIELD DEFINITIONS:
                - Use 'net_value' for revenue/spend calculations (this is the finalized amount)
                - Use 'conversion_value' only when specifically asked about conversion values
                - 'conversion_date' is the primary date field for time-based analysis

                When presenting data, format it as tables when appropriate.
                Focus on key metrics and provide actionable insights.
                Always use the same field for the same type of question to ensure consistency."""

            # Add data dictionary if provided in config (from frontend)
            if hasattr(self, 'data_dictionary') and self.data_dictionary:
                base_instruction += f"\n\nIMPORTANT FIELD DEFINITIONS:\n{self.data_dictionary}\n\nAlways use these field definitions consistently for the same types of questions."

            published_context.system_instruction = base_instruction

            published_context.datasource_references = datasource_references

            # Create the data agent object
            data_agent = geminidataanalytics.DataAgent()
            data_agent.data_analytics_agent.published_context = published_context

            # Create the agent request
            request = geminidataanalytics.CreateDataAgentRequest(
                parent=parent,
                data_agent_id=data_agent_id,
                data_agent=data_agent,
            )

            # Handle the Operation object properly
            logger.info("Creating data agent operation...")
            operation = self.data_agent_client.create_data_agent(request=request)
            logger.info("Operation started, waiting for completion...")

            # Wait for the operation to complete and get the actual data agent
            created_agent = operation.result(timeout=120)  # Wait up to 2 minutes

            self.data_agent_name = created_agent.name
            logger.info(f"Data agent created successfully: {self.data_agent_name}")
            return created_agent

        except Exception as e:
            logger.error(f"Failed to create data agent: {e}")
            raise

    def chat(self, message, conversation_history=None):
        """Send a message to the data agent and get response (stateless)."""
        try:
            if not self.data_agent_name:
                logger.info("Data agent not initialized. Creating now...")
                self.create_data_agent()

            # Prepare conversation history and the new message
            all_messages = []
            if conversation_history:
                for msg in conversation_history:
                    role = msg.get('role')
                    content = msg.get('content')
                    if role == 'user':
                        user_msg = geminidataanalytics.Message()
                        user_msg.user_message.text = content
                        all_messages.append(user_msg)
                    elif role == 'assistant' or role == 'model':
                        # For system messages in conversation history
                        system_msg = geminidataanalytics.Message()
                        system_msg.system_message.text.parts = [content]
                        all_messages.append(system_msg)

            # Add the current user message
            current_message = geminidataanalytics.Message()
            current_message.user_message.text = message
            all_messages.append(current_message)

            # Use data agent context for stateless chat
            data_agent_context = geminidataanalytics.DataAgentContext()
            data_agent_context.data_agent = self.data_agent_name

            request = geminidataanalytics.ChatRequest(
                parent=f"projects/{self.project_id}/locations/{self.location}",
                messages=all_messages,
                data_agent_context=data_agent_context,
            )

            logger.info(f"Sending chat request with message: {message[:100]}...")
            stream = self.data_chat_client.chat(request=request, timeout=300)

            # Process the streaming response - REMOVED charts array
            response_data = {'text': '', 'tables': [], 'sql_queries': []}

            for reply in stream:
                logger.info(f"Processing reply with attributes: {dir(reply)}")

                if hasattr(reply, 'system_message'):
                    system_msg = reply.system_message
                    logger.info(f"System message attributes: {dir(system_msg)}")

                    # Handle text responses
                    if hasattr(system_msg, 'text') and system_msg.text:
                        if hasattr(system_msg.text, 'parts'):
                            response_data['text'] += ''.join(system_msg.text.parts)
                        elif hasattr(system_msg.text, 'text'):
                            response_data['text'] += system_msg.text.text

                    # Handle schema responses
                    if hasattr(system_msg, 'schema') and system_msg.schema:
                        logger.info("Found schema response")
                        # Process schema information if needed
                        pass

                    # Handle data responses (tables)
                    if hasattr(system_msg, 'data') and system_msg.data:
                        logger.info(f"Found data response with attributes: {dir(system_msg.data)}")
                        # Extract table data
                        if hasattr(system_msg.data, 'result') and system_msg.data.result:
                            logger.info(f"Data result attributes: {dir(system_msg.data.result)}")
                            table_data = self._extract_table_data(system_msg.data.result)
                            if table_data:
                                # Format the table data for better rendering
                                formatted_table = self._format_table_for_rendering(table_data)
                                response_data['tables'].append(formatted_table)

                        # Handle SQL queries
                        if hasattr(system_msg.data, 'generated_sql'):
                            response_data['sql_queries'].append(str(system_msg.data.generated_sql))

                    # REMOVED all chart handling code
                    # Skip chart responses entirely
                    if hasattr(system_msg, 'chart') and system_msg.chart:
                        logger.info("Skipping chart response - chart rendering disabled")
                        continue

                    # Skip chart detection in system message string
                    if "chart" in str(system_msg):
                        logger.info("Found chart reference in system message - skipping")
                        continue

            logger.info("Chat response processed successfully")
            return response_data

        except Exception as e:
            logger.error(f"Chat error: {e}")
            raise

    def _extract_table_data(self, data_result):
        """Extract table data from the API response"""
        try:
            logger.info(f"Extracting table data from result type: {type(data_result)}")

            # Try direct attribute access first
            if hasattr(data_result, 'schema') and hasattr(data_result, 'data'):
                logger.info("Using direct attribute access for table data")

                # Get column names from schema
                columns = []
                if hasattr(data_result.schema, 'fields'):
                    for field in data_result.schema.fields:
                        if hasattr(field, 'name'):
                            columns.append(field.name)
                        else:
                            columns.append(str(field))

                # Get row data
                rows = []
                for row_data in data_result.data:
                    row = {}
                    # Convert row_data to dict using our helper
                    row_dict = self._convert_proto_to_dict(row_data)

                    for col in columns:
                        if isinstance(row_dict, dict) and col in row_dict:
                            row[col] = row_dict[col]
                        else:
                            row[col] = None
                    rows.append(row)

                logger.info(f"Extracted {len(rows)} rows with {len(columns)} columns")
                return {'columns': columns, 'rows': rows}

            # Try converting the entire result to dict
            else:
                logger.info("Using proto conversion for table data")
                result_dict = self._convert_proto_to_dict(data_result)
                logger.info(
                    f"Converted result keys: {result_dict.keys() if isinstance(result_dict, dict) else 'Not a dict'}")

                if isinstance(result_dict, dict) and 'schema' in result_dict and 'data' in result_dict:
                    # Get column names from schema
                    columns = []
                    if 'fields' in result_dict['schema']:
                        columns = [field.get('name', str(field)) for field in result_dict['schema']['fields']]

                    # Get row data
                    rows = []
                    for row_data in result_dict['data']:
                        if isinstance(row_data, dict):
                            row = {}
                            for col in columns:
                                row[col] = row_data.get(col, None)
                            rows.append(row)

                    logger.info(f"Extracted {len(rows)} rows with {len(columns)} columns via conversion")
                    return {'columns': columns, 'rows': rows}

        except Exception as e:
            logger.error(f"Error extracting table data: {e}", exc_info=True)
        return None

    def _format_table_for_rendering(self, table_data):
        """Format table data for custom rendering with additional metadata"""
        try:
            if not table_data:
                return table_data

            # Add formatting metadata for better rendering
            formatted_table = {
                'columns': table_data['columns'],
                'rows': table_data['rows'],
                'metadata': {
                    'total_rows': len(table_data['rows']),
                    'total_columns': len(table_data['columns']),
                    'truncated': len(table_data['rows']) > 100,  # Flag if table is large
                    'display_rows': table_data['rows'][:100] if len(table_data['rows']) > 100 else table_data['rows']
                }
            }

            # Add column types if we can infer them
            column_types = {}
            if formatted_table['rows']:
                sample_row = formatted_table['rows'][0]
                for col in formatted_table['columns']:
                    val = sample_row.get(col)
                    if isinstance(val, (int, float)):
                        column_types[col] = 'numeric'
                    elif isinstance(val, bool):
                        column_types[col] = 'boolean'
                    else:
                        column_types[col] = 'text'
            formatted_table['metadata']['column_types'] = column_types

            return formatted_table

        except Exception as e:
            logger.error(f"Error formatting table: {e}")
            return table_data

    # REMOVED both _extract_chart_data and _extract_chart_data_alternative methods


# --- Flask Routes ---

chatbot = BigQueryChatbot(
    project_id=app.config['PROJECT_ID'],
    location=app.config['LOCATION'],
    dataset_id=app.config['BIGQUERY_DATASET_ID']
)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'BigQuery Chatbot'})


@app.route('/api/initialize', methods=['POST'])
def initialize_agent():
    """Initialize the data agent with optional config"""
    try:
        data = request.get_json() or {}
        config = data.get('config', {})

        # Update chatbot config if provided
        if config.get('project_id'):
            chatbot.project_id = config['project_id']
        if config.get('location'):
            chatbot.location = config['location']
        if config.get('dataset_id'):
            chatbot.dataset_id = config['dataset_id']
        if config.get('table_id'):
            chatbot.table_id = config['table_id']
        if config.get('data_dictionary'):
            chatbot.data_dictionary = config['data_dictionary']
        agent = chatbot.create_data_agent()
        return jsonify({
            'success': True,
            'agent_name': agent.name,
            'message': 'Data agent initialized successfully',
            'config': {
                'project_id': chatbot.project_id,
                'location': chatbot.location,
                'dataset_id': chatbot.dataset_id,
                'table_id': chatbot.table_id
            }
        })
    except Exception as e:
        logger.error(f"Agent initialization error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """Handle chat API requests with optional config"""
    try:
        data = request.get_json()
        message = data.get('message', '')
        history = data.get('history', [])
        config = data.get('config', {})

        if not message.strip():
            return jsonify({'error': 'Message cannot be empty'}), 400

        # Update chatbot config if provided
        if config.get('project_id'):
            chatbot.project_id = config['project_id']
        if config.get('location'):
            chatbot.location = config['location']
        if config.get('dataset_id'):
            chatbot.dataset_id = config['dataset_id']
        if config.get('table_id'):
            chatbot.table_id = config['table_id']
        # In both initialize_agent() and chat_endpoint(), add after the table_id update:
        if config.get('data_dictionary'):
            chatbot.data_dictionary = config['data_dictionary']
        response = chatbot.chat(message, history)
        return jsonify({'success': True, 'response': response})

    except Exception as e:
        logger.error(f"Chat endpoint error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(
        debug=app.config.get('DEBUG', True),
        host='0.0.0.0',
        port=port
    )
