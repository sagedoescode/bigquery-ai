import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # Google Cloud Configuration
    PROJECT_ID = os.getenv('GOOGLE_CLOUD_PROJECT_ID', 'graphical-cairn-420213')
    LOCATION = os.getenv('GOOGLE_CLOUD_LOCATION', 'global')
    CREDENTIALS_PATH = os.getenv('GOOGLE_APPLICATION_CREDENTIALS', 'auth/graphical-cairn-420213-3c84d67c7797.json')

    # BigQuery Configuration
    BIGQUERY_DATASET_ID = os.getenv('BIGQUERY_DATASET_ID', 'bigquery-public-data.covid19_weathersource_com')

    # Flask Configuration
    SECRET_KEY = os.getenv('SECRET_KEY', 'c7cafebca35acbd7423c8606f465ad50b7afed4bd31df1fd46cb208bbb2e78eb')
    DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'

    # CORS Configuration
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*').split(',')