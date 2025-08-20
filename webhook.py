import json
import os
import pandas as pd
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
import asyncio
import logging
import csv
import io

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get bot token and admin chat ID from environment
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID")  # Your personal chat ID

if not BOT_TOKEN:
    raise ValueError("TELEGRAM_BOT_TOKEN environment variable is required")
if not ADMIN_CHAT_ID:
    raise ValueError("ADMIN_CHAT_ID environment variable is required")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command"""
    if update.message:
        await update.message.reply_text(
            "🩺 Welcome to NEET-PG MCQ Bot!\n\n"
            "I will post MCQs hourly for your preparation. "
            "Click on the answer options to test your knowledge!"
        )

async def handle_answer_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle answer button callbacks"""
    query = update.callback_query
    if not query:
        return
        
    await query.answer()
    
    try:
        # Parse callback data: "answer_{question_id}_{selected_option}_{correct_answer}"
        callback_data = query.data
        if not callback_data:
            await query.edit_message_text("❌ Invalid callback data")
            return
            
        parts = callback_data.split('_')
        
        if len(parts) != 4 or parts[0] != 'answer':
            await query.edit_message_text("❌ Invalid callback data")
            return
        
        question_id = parts[1]
        selected_option = parts[2]
        correct_answer = parts[3]
        
        # Load CSV to get question details
        df = pd.read_csv('neet-pg-mcqs.csv')
        question_row = df[df['Question Number'] == int(question_id)]
        
        if question_row.empty:
            await query.edit_message_text("❌ Question not found")
            return
        
        question_data = question_row.iloc[0]
        
        # Check if answer is correct
        is_correct = selected_option.upper() == correct_answer.upper()
        
        # Prepare response message
        if is_correct:
            feedback = "✅ Correct! Well done!"
        else:
            feedback = f"❌ Wrong! The correct answer was {correct_answer.upper()}"
        
        # Get the correct option text
        correct_option_text = question_data[f'Option {ord(correct_answer.upper()) - ord("A") + 1}']
        
        response_text = (
            f"{feedback}\n\n"
            f"📚 **Subject:** {question_data['Subject']}\n"
            f"📖 **Topic:** {question_data['Topic']}\n\n"
            f"**Correct Answer:** {correct_answer.upper()}) {correct_option_text}\n\n"
            f"💡 **Explanation:**\n{question_data['Explanation']}\n\n"
            f"📄 **Source:** {question_data['Source']}"
        )
        
        await query.edit_message_text(
            text=response_text,
            parse_mode='Markdown'
        )
        
    except Exception as e:
        logger.error(f"Error handling callback: {e}")
        await query.edit_message_text("❌ Error processing your answer. Please try again.")

async def handle_admin_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle messages from admin to add new MCQ data"""
    if not update.message or not update.message.text:
        return
    
    # Check if message is from admin
    chat_id = str(update.message.chat_id)
    if chat_id != ADMIN_CHAT_ID:
        return
    
    message_text = update.message.text.strip()
    
    # Handle /add_mcq command
    if message_text.startswith('/add_mcq'):
        await update.message.reply_text(
            "📝 **Add New MCQs**\n\n"
            "Send me MCQ data in CSV format. Each line should contain:\n"
            "`Year,Question Number,Subject,Topic,Question,Option 1,Option 2,Option 3,Option 4,Answer,Explanation,Source`\n\n"
            "Example:\n"
            "`2023,1,Anatomy,Heart,Which chamber pumps blood to lungs?,Right atrium,Right ventricle,Left atrium,Left ventricle,B,Right ventricle pumps deoxygenated blood to lungs,textbook.pdf`\n\n"
            "You can send multiple lines at once!",
            parse_mode='Markdown'
        )
        return
    
    # Handle /stats command
    if message_text.startswith('/stats'):
        try:
            df = pd.read_csv('neet-pg-mcqs.csv')
            stats = {
                'total_questions': len(df),
                'subjects': len(df['Subject'].unique()),
                'topics': len(df['Topic'].unique()),
                'years': sorted(df['Year'].unique().tolist())
            }
            
            stats_text = (
                f"📊 **MCQ Database Statistics**\n\n"
                f"📚 Total Questions: {stats['total_questions']}\n"
                f"📖 Subjects: {stats['subjects']}\n"
                f"🏷️ Topics: {stats['topics']}\n"
                f"📅 Years: {', '.join(map(str, stats['years']))}"
            )
            
            await update.message.reply_text(stats_text, parse_mode='Markdown')
        except Exception as e:
            await update.message.reply_text(f"❌ Error getting stats: {str(e)}")
        return
    
    # Try to parse as CSV data
    try:
        # Check if the message looks like CSV data
        if ',' in message_text and len(message_text.split(',')) >= 11:
            await process_csv_data(update, message_text)
        else:
            # Show help for admin
            await update.message.reply_text(
                "🤖 **Admin Commands:**\n\n"
                "/add_mcq - Show format for adding new MCQs\n"
                "/stats - Show database statistics\n\n"
                "Or send CSV data directly to add new questions!",
                parse_mode='Markdown'
            )
    except Exception as e:
        logger.error(f"Error in admin message handler: {e}")
        await update.message.reply_text(f"❌ Error processing message: {str(e)}")

async def process_csv_data(update: Update, csv_text: str) -> None:
    """Process CSV data sent by admin"""
    try:
        # Parse CSV data
        csv_lines = csv_text.strip().split('\n')
        new_questions = []
        
        for line_num, line in enumerate(csv_lines, 1):
            if not line.strip():
                continue
                
            # Parse CSV line
            reader = csv.reader(io.StringIO(line))
            row = next(reader)
            
            if len(row) < 11:
                if update.message:
                    await update.message.reply_text(
                        f"❌ Line {line_num} has only {len(row)} fields. Need 11 fields:\n"
                        "Year,Question Number,Subject,Topic,Question,Option 1,Option 2,Option 3,Option 4,Answer,Explanation,Source"
                    )
                return
            
            # Validate data
            year, q_num, subject, topic, question, opt1, opt2, opt3, opt4, answer, explanation, source = row[:11]
            
            # Basic validation
            if not all([year, q_num, subject, topic, question, opt1, opt2, opt3, opt4, answer, explanation]):
                if update.message:
                    await update.message.reply_text(f"❌ Line {line_num} has empty required fields")
                return
            
            if answer.upper() not in ['A', 'B', 'C', 'D']:
                if update.message:
                    await update.message.reply_text(f"❌ Line {line_num}: Answer must be A, B, C, or D")
                return
            
            new_questions.append(row[:11])
        
        if not new_questions:
            if update.message:
                await update.message.reply_text("❌ No valid questions found")
            return
        
        # Read existing CSV
        df_existing = pd.read_csv('neet-pg-mcqs.csv')
        
        # Create DataFrame for new questions
        columns = ['Year', 'Question Number', 'Subject', 'Topic', 'Question', 
                  'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Answer', 'Explanation', 'Source']
        df_new = pd.DataFrame(new_questions)
        df_new.columns = columns
        
        # Combine and save
        df_combined = pd.concat([df_existing, df_new], ignore_index=True)
        df_combined.to_csv('neet-pg-mcqs.csv', index=False)
        
        # Success message
        if update.message:
            await update.message.reply_text(
                f"✅ **Successfully added {len(new_questions)} new MCQ(s)!**\n\n"
                f"📊 Total questions now: {len(df_combined)}\n\n"
                f"**Added questions:**\n" + 
                "\n".join([f"• Q{q[1]}: {q[2]} - {q[3]}" for q in new_questions[:5]]) +
                (f"\n... and {len(new_questions)-5} more" if len(new_questions) > 5 else ""),
                parse_mode='Markdown'
            )
        
        logger.info(f"Added {len(new_questions)} new MCQs to database")
        
    except Exception as e:
        logger.error(f"Error processing CSV data: {e}")
        if update.message:
            await update.message.reply_text(f"❌ Error processing CSV data: {str(e)}")

def create_application():
    """Create and configure the bot application"""
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Add handlers
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(handle_answer_callback))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_admin_message))
    
    return application

async def handler(request):
    """Vercel serverless function handler"""
    try:
        # Parse the incoming webhook data
        if request.method != 'POST':
            return {
                'statusCode': 405,
                'body': json.dumps({'error': 'Method not allowed'})
            }
        
        # Get request body
        body = await request.body()
        update_data = json.loads(body)
        
        # Create application
        application = create_application()
        
        # Process the update
        update = Update.de_json(update_data, application.bot)
        await application.process_update(update)
        
        return {
            'statusCode': 200,
            'body': json.dumps({'status': 'success'})
        }
        
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }

# For Vercel
def main(request):
    """Main entry point for Vercel"""
    return asyncio.run(handler(request))
