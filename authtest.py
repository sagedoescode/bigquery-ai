import os
from google.cloud import bigquery
from google.cloud import geminidataanalytics
from config import Config

# Use the same configuration as your Flask app
CREDENTIALS_PATH = Config.CREDENTIALS_PATH if hasattr(Config, 'CREDENTIALS_PATH') else "service-account-key.json"
PROJECT_ID = Config.PROJECT_ID
LOCATION = Config.LOCATION
DATASET_ID = Config.BIGQUERY_DATASET_ID


def test_individual_api_calls():
    """Test each Google Cloud API call individually to isolate the problem"""

    # Set credentials
    os.environ['GOOGLE_APPLICATION_CREDENTIALS'] = CREDENTIALS_PATH

    print(f"Testing individual API calls for project: {PROJECT_ID}")
    print(f"Using credentials: {CREDENTIALS_PATH}")
    print("=" * 60)

    # Test 1: BigQuery Client Initialization
    try:
        print("1. Testing BigQuery Client Initialization...")
        bq_client = bigquery.Client(project=PROJECT_ID)
        print("   ✅ BigQuery Client: Initialized successfully")
    except Exception as e:
        print(f"   ❌ BigQuery Client FAILED: {e}")
        return False

    # Test 2: BigQuery Dataset List
    try:
        print("2. Testing BigQuery Dataset Listing...")
        datasets = list(bq_client.list_datasets())
        print(f"   ✅ BigQuery Datasets: Found {len(datasets)} datasets")
        if datasets:
            for dataset in datasets[:3]:  # Show first 3
                print(f"      - {dataset.dataset_id}")
    except Exception as e:
        print(f"   ❌ BigQuery Dataset Listing FAILED: {e}")

    # Test 3: Data Chat Client Initialization
    try:
        print("3. Testing Data Chat Client Initialization...")
        data_chat_client = geminidataanalytics.DataChatServiceClient()
        print("   ✅ Data Chat Client: Initialized successfully")
    except Exception as e:
        print(f"   ❌ Data Chat Client FAILED: {e}")
        return False

    # Test 4: Data Agent Client Initialization
    try:
        print("4. Testing Data Agent Client Initialization...")
        data_agent_client = geminidataanalytics.DataAgentServiceClient()
        print("   ✅ Data Agent Client: Initialized successfully")
    except Exception as e:
        print(f"   ❌ Data Agent Client FAILED: {e}")
        return False

    # Test 5: Check if Data Agent exists
    try:
        print("5. Testing Data Agent Existence Check...")
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}"
        data_agent_name = f"{parent}/dataAgents/default-sales-agent"

        try:
            agent = data_agent_client.get_data_agent(name=data_agent_name)
            print(f"   ✅ Data Agent EXISTS: {data_agent_name}")
            print(f"      Agent name: {agent.name}")
        except Exception as inner_e:
            print(f"   ℹ️  Data Agent doesn't exist yet (this is normal): {inner_e}")

    except Exception as e:
        print(f"   ❌ Data Agent Check FAILED: {e}")

    # Test 6: Try creating a minimal BigQuery table reference
    try:
        print("6. Testing BigQuery Table Reference Creation...")
        bigquery_table_reference = geminidataanalytics.BigQueryTableReference()
        bigquery_table_reference.project_id = PROJECT_ID
        bigquery_table_reference.dataset_id = DATASET_ID
        print("   ✅ BigQuery Table Reference: Created successfully")
    except Exception as e:
        print(f"   ❌ BigQuery Table Reference FAILED: {e}")

    # Test 7: Try creating a data agent (this might fail with permissions)
    try:
        print("7. Testing Data Agent Creation...")
        parent = f"projects/{PROJECT_ID}/locations/{LOCATION}"
        data_agent_name = f"{parent}/dataAgents/test-agent"

        # Create minimal data agent
        published_context = geminidataanalytics.Context()
        published_context.system_instruction = "You are a test assistant."

        data_agent = geminidataanalytics.DataAgent()
        data_agent.data_analytics_agent.published_context = published_context

        request = geminidataanalytics.CreateDataAgentRequest(
            parent=parent,
            data_agent_id="test-agent",
            data_agent=data_agent,
        )

        created_agent = data_agent_client.create_data_agent(request=request)
        print(f"   ✅ Data Agent Creation: SUCCESS - {created_agent.name}")

        # Clean up - delete the test agent
        try:
            data_agent_client.delete_data_agent(name=data_agent_name)
            print("   ✅ Test agent cleaned up successfully")
        except:
            print("   ⚠️  Could not clean up test agent (may need manual deletion)")

    except Exception as e:
        print(f"   ❌ Data Agent Creation FAILED: {e}")
        print(f"      This tells us exactly what's wrong!")

    print("=" * 60)
    print("Test completed! Check which specific API call is failing.")
    return True


if __name__ == "__main__":
    test_individual_api_calls()