import json
import os
import pandas as pd
import random
from datetime import datetime
import requests
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get configuration from environment
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")  # Group chat ID where MCQs will be posted

if not BOT_TOKEN or not CHAT_ID:
    raise ValueError("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables are required")

def load_mcq_data():
    """Load MCQ data from CSV file"""
    try:
        df = pd.read_csv('neet-pg-mcqs.csv')
        return df
    except Exception as e:
        logger.error(f"Error loading CSV: {e}")
        raise

def select_random_question(df):
    """Select a random question from the dataset"""
    # Simple random selection - in production, you might want more sophisticated logic
    # to avoid recent repeats
    return df.sample(n=1).iloc[0]

def create_mcq_message(question_data):
    """Create formatted MCQ message with inline keyboard"""
    question_text = (
        f"🩺 **NEET-PG MCQ - {question_data['Subject']}**\n"
        f"📖 **Topic:** {question_data['Topic']}\n"
        f"📅 **Year:** {question_data['Year']}\n\n"
        f"**Question {question_data['Question Number']}:**\n"
        f"{question_data['Question']}\n\n"
        f"A) {question_data['Option 1']}\n"
        f"B) {question_data['Option 2']}\n"
        f"C) {question_data['Option 3']}\n"
        f"D) {question_data['Option 4']}"
    )
    
    # Create inline keyboard with answer options
    keyboard = [
        [
            {"text": "A", "callback_data": f"answer_{question_data['Question Number']}_A_{question_data['Answer']}"},
            {"text": "B", "callback_data": f"answer_{question_data['Question Number']}_B_{question_data['Answer']}"},
            {"text": "C", "callback_data": f"answer_{question_data['Question Number']}_C_{question_data['Answer']}"},
            {"text": "D", "callback_data": f"answer_{question_data['Question Number']}_D_{question_data['Answer']}"}
        ]
    ]
    
    return question_text, keyboard

def send_telegram_message(text, keyboard=None):
    """Send message to Telegram using Bot API"""
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    
    payload = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "Markdown"
    }
    
    if keyboard:
        payload["reply_markup"] = json.dumps({"inline_keyboard": keyboard})
    
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending message: {e}")
        raise

async def handler(request):
    """Vercel serverless function handler for scheduled MCQ posting"""
    try:
        # Verify this is a valid cron request (optional security measure)
        auth_header = request.headers.get('Authorization', '')
        expected_auth = os.getenv('CRON_SECRET', 'default-secret')
        
        if f'Bearer {expected_auth}' != auth_header and request.method == 'POST':
            # Allow GET requests for testing
            if request.method != 'GET':
                return {
                    'statusCode': 401,
                    'body': json.dumps({'error': 'Unauthorized'})
                }
        
        # Load MCQ data
        df = load_mcq_data()
        
        if df.empty:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'No MCQ data available'})
            }
        
        # Select random question
        question_data = select_random_question(df)
        
        # Create message and keyboard
        message_text, keyboard = create_mcq_message(question_data)
        
        # Send message to Telegram
        result = send_telegram_message(message_text, keyboard)
        
        logger.info(f"MCQ sent successfully: Question {question_data['Question Number']}")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'status': 'success',
                'question_number': int(question_data['Question Number']),
                'subject': question_data['Subject'],
                'topic': question_data['Topic'],
                'timestamp': datetime.now().isoformat()
            })
        }
        
    except Exception as e:
        logger.error(f"Error in send-mcq handler: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e),
                'timestamp': datetime.now().isoformat()
            })
        }

# For Vercel
def main(request):
    """Main entry point for Vercel"""
    import asyncio
    return asyncio.run(handler(request))
