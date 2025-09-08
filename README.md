# BigQuery Conversational Analytics Chatbot

AI-powered web application for querying BigQuery sales data using natural language, built with Google's Conversational Analytics API.

## Features

- Natural language queries to BigQuery data
- Clean table visualization of results
- Real-time chat interface
- Enterprise-grade Google Cloud integration
- Responsive web design

## Setup Instructions

### Prerequisites

1. Google Cloud Project with billing enabled
2. BigQuery dataset with sales data
3. Python 3.8+ installed

### Step 1: Google Cloud Setup

1. **Enable Required APIs:**
   ```bash
   gcloud services enable geminidataanalytics.googleapis.com
   gcloud services enable bigquery.googleapis.com
   gcloud services enable aiplatform.googleapis.com
   gcloud services enable cloudaicompanion.googleapis.com
   ```

2. **Create Service Account:**
   ```bash
   gcloud iam service-accounts create bigquery-chatbot
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \\
     --member="serviceAccount:bigquery-chatbot@YOUR_PROJECT_ID.iam.gserviceaccount.com" \\
     --role="roles/bigquery.user"
   gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \\
     --member="serviceAccount:bigquery-chatbot@YOUR_PROJECT_ID.iam.gserviceaccount.com" \\
     --role="roles/cloudaicompanion.user"
   ```

3. **Download Credentials:**
   ```bash
   gcloud iam service-accounts keys create auth/service-account.json \\
     --iam-account=bigquery-chatbot@YOUR_PROJECT_ID.iam.gserviceaccount.com
   ```

### Step 2: Project Setup

1. **Clone/Create Project Directory:**
   ```bash
   mkdir bigquery-chatbot
   cd bigquery-chatbot
   ```

2. **Install Dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment:**
   ```bash
   cp .env.template .env
   # Edit .env with your configuration
   ```

4. **Create Required Directories:**
   ```bash
   mkdir -p auth static templates
   ```

### Step 3: Configuration

Edit `.env` file with your settings:

```env
GOOGLE_CLOUD_PROJECT_ID=your-actual-project-id
BIGQUERY_DATASET_ID=your-dataset-name
GOOGLE_APPLICATION_CREDENTIALS=auth/service-account.json
SECRET_KEY=your-random-secret-key
```

### Step 4: Deploy

**Local Development:**
```bash
python app.py
```

**Production (using Gunicorn):**
```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

**Docker Deployment:**
```dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "app:app"]
```

### Step 5: Testing

1. Open browser to `http://localhost:5000`
2. Ask questions like:
   - "Show me July spend per market"
   - "What's the YoY growth in revenue?"
   - "Compare Q3 performance across regions"

## API Endpoints

- `GET /` - Main chat interface
- `POST /api/chat` - Send chat message
- `POST /api/initialize` - Initialize data agent
- `GET /api/health` - Health check

## Troubleshooting

**Common Issues:**

1. **Authentication Error:**
   - Verify service account credentials
   - Check IAM permissions
   - Ensure APIs are enabled

2. **BigQuery Access Error:**
   - Verify dataset exists and is accessible
   - Check BigQuery permissions

3. **API Quota Error:**
   - Monitor API usage in Google Cloud Console
   - Implement rate limiting if needed

## Cost Management

- Monitor BigQuery query costs
- Set up billing alerts
- Implement query limits for cost control

## Security Notes

- Never commit service account keys to version control
- Use environment variables for sensitive data
- Implement proper authentication for production use
- Restrict CORS origins for production

## Support

For issues related to Google Cloud APIs, consult the official documentation:
- [Conversational Analytics API](https://cloud.google.com/bigquery/docs/conversational-analytics-api)
- [BigQuery Documentation](https://cloud.google.com/bigquery/docs)