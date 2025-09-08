from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from google.cloud import geminidataanalytics
import os
import logging
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
        # Assuming table_id is passed or configured similarly
        self.table_id = app.config.get('BIGQUERY_TABLE_ID', None)
        self.data_chat_client = None
        self.data_agent_client = None
        self.data_agent_name = None
        self.initialize_client()

    def initialize_client(self):
        """Initialize Google Cloud clients and authenticate"""
        try:
            if 'CREDENTIALS_PATH' in app.config and app.config['CREDENTIALS_PATH']:
                os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = app.config['CREDENTIALS_PATH']

            self.data_chat_client = geminidataanalytics.DataChatServiceClient()
            self.data_agent_client = geminidataanalytics.DataAgentServiceClient()
            logger.info("Google Cloud clients initialized successfully")

        except Exception as e:
            logger.error(f"Failed to initialize Google Cloud clients: {e}")
            raise

    def create_data_agent(self, data_agent_id="default-sales-agent"):
        """Create or get a data agent for BigQuery interactions based on documentation."""
        try:
            parent = f"projects/{self.project_id}/locations/{self.location}"
            self.data_agent_name = f"{parent}/dataAgents/{data_agent_id}"

            # Check if agent already exists
            try:
                self.data_agent_client.get_data_agent(name=self.data_agent_name)
                logger.info(f"Data agent '{self.data_agent_name}' already exists. Using it.")
                return self.data_agent_client.get_data_agent(name=self.data_agent_name)
            except Exception:
                logger.info(f"Data agent '{self.data_agent_name}' not found. Creating a new one.")

            # Define the BigQuery data source reference
            bigquery_table_reference = geminidataanalytics.BigQueryTableReference()
            bigquery_table_reference.project_id = self.project_id
            bigquery_table_reference.dataset_id = self.dataset_id

            # If a specific table is configured, add it.
            # The API supports multiple tables.
            table_references = []
            if self.table_id:
                bigquery_table_reference.table_id = self.table_id
                table_references.append(bigquery_table_reference)

            datasource_references = geminidataanalytics.DatasourceReferences()
            datasource_references.bq.table_references = table_references

            # Set up context for the agent
            published_context = geminidataanalytics.Context()
            published_context.system_instruction = """You are a sales data analyst assistant. 
                Analyze sales data from BigQuery tables and provide clear, accurate insights.
                When presenting data, format it as tables when appropriate.
                Focus on key metrics like revenue, spend, growth rates, and market performance."""
            published_context.datasource_references = datasource_references

            # Create the data agent object
            data_agent = geminidataanalytics.DataAgent()
            data_agent.data_analytics_agent.published_context = published_context
            data_agent.name = self.data_agent_name

            # Create the agent request
            request = geminidataanalytics.CreateDataAgentRequest(
                parent=parent,
                data_agent_id=data_agent_id,
                data_agent=data_agent,
            )

            self.data_agent_client.create_data_agent(request=request)
            logger.info(f"Data agent created: {self.data_agent_name}")
            return data_agent

        except Exception as e:
            logger.error(f"Failed to create data agent: {e}")
            raise

    def chat(self, message, conversation_history=None):
        """Send a message to the data agent and get response (stateless)."""
        try:
            if not self.data_agent_name:
                logger.warning("Data agent not initialized. Initializing now.")
                self.create_data_agent()

            # Prepare conversation history and the new message
            all_messages = []
            if conversation_history:
                for msg in conversation_history:
                    role = msg.get('role')
                    content = msg.get('content')
                    if role == 'user':
                        all_messages.append(geminidataanalytics.Message(user_message={'text': content}))
                    elif role == 'model':
                        # This part can be tricky as the model response is complex.
                        # For stateless, we might just keep text parts of the history.
                        all_messages.append(
                            geminidataanalytics.Message(system_message={'text_message': {'text': content}}))

            all_messages.append(geminidataanalytics.Message(user_message={'text': message}))

            # Use data agent context for stateless chat
            data_agent_context = geminidataanalytics.DataAgentContext()
            data_agent_context.data_agent = self.data_agent_name

            request = geminidataanalytics.ChatRequest(
                parent=f"projects/{self.project_id}/locations/{self.location}",
                messages=all_messages,
                data_agent_context=data_agent_context,
            )

            stream = self.data_chat_client.chat(request=request)

            # Process the streaming response
            response_data = {'text': '', 'tables': [], 'charts': [], 'sql_queries': []}
            for reply in stream:
                system_msg = reply.system_message
                if system_msg.text_message:
                    response_data['text'] += system_msg.text_message.text
                if system_msg.query_message:
                    response_data['sql_queries'].append(system_msg.query_message.query)
                # Add extraction for tables and charts as needed (similar to your original code)
                # This part needs careful implementation based on actual response objects.

            return response_data

        except Exception as e:
            logger.error(f"Chat error: {e}")
            raise


# --- Flask Routes ---

chatbot = BigQueryChatbot(
    project_id=app.config['PROJECT_ID'],
    location=app.config['LOCATION'],
    dataset_id=app.config['BIGQUERY_DATASET_ID']
)


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/initialize', methods=['POST'])
def initialize_agent():
    """Initialize the data agent"""
    try:
        agent = chatbot.create_data_agent()
        return jsonify({
            'success': True,
            'agent_name': agent.name,
            'message': 'Data agent initialized successfully'
        })
    except Exception as e:
        logger.error(f"Agent initialization error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/chat', methods=['POST'])
def chat_endpoint():
    """Handle chat API requests"""
    try:
        data = request.get_json()
        message = data.get('message', '')
        history = data.get('history', [])

        if not message.strip():
            return jsonify({'error': 'Message cannot be empty'}), 400

        response = chatbot.chat(message, history)
        return jsonify({'success': True, 'response': response})

    except Exception as e:
        logger.error(f"Chat endpoint error: {e}", exc_info=True)
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'BigQuery Chatbot'})


if __name__ == '__main__':
    app.run(debug=app.config.get('DEBUG', True), host='0.0.0.0', port=5000)
