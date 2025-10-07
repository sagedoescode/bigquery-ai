import os
import json
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Google Cloud Configuration
    PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT_ID', 'gen-lang-client-0691935742')
    LOCATION = os.getenv('GOOGLE_CLOUD_LOCATION', 'global')

    # Handle both JSON string (Render) and file path (local)
    creds_env = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if creds_env and creds_env.startswith('{'):
        # It's a JSON string from Render - write it to a temporary file
        import tempfile
        temp_creds = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        temp_creds.write(creds_env)
        temp_creds.flush()
        CREDENTIALS_PATH = temp_creds.name
    else:
        # It's a file path (local development)
        CREDENTIALS_PATH = creds_env or 'auth/gen-lang-client-0691935742-7f02a3e9f353.json'

    # BigQuery Configuration
    BIGQUERY_DATASET_ID = os.getenv('BIGQUERY_DATASET_ID', 'bigquery-public-data.covid19_weathersource_com')

    # Flask Configuration
    SECRET_KEY = os.getenv('SECRET_KEY', 'c7cafebca35acbd7423c8606f465ad50b7afed4bd31df1fd46cb208bbb2e78eb')
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'

    # CORS Configuration
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')