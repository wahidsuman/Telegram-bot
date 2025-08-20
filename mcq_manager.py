import pandas as pd
import random
from datetime import datetime, timedelta
import json
import os

class MCQManager:
    """Utility class for managing MCQ question selection and rotation"""
    
    def __init__(self, csv_file_path='neet-pg-mcqs.csv'):
        self.csv_file_path = csv_file_path
        self.df = None
        self.load_data()
    
    def load_data(self):
        """Load MCQ data from CSV file"""
        try:
            self.df = pd.read_csv(self.csv_file_path)
            print(f"Loaded {len(self.df)} questions from {self.csv_file_path}")
        except Exception as e:
            print(f"Error loading CSV file: {e}")
            raise
    
    def get_random_question(self, exclude_recent=True, recent_window_hours=24):
        """
        Get a random question, optionally excluding recently asked ones
        
        Args:
            exclude_recent (bool): Whether to exclude recently asked questions
            recent_window_hours (int): Hours to consider for "recent" questions
        
        Returns:
            pandas.Series: Question data
        """
        if self.df is None or self.df.empty:
            raise ValueError("No MCQ data available")
        
        available_questions = self.df.copy()
        
        if exclude_recent:
            # In a stateless environment, we can't easily track recent questions
            # This is a simplified implementation - in production, you might use
            # external storage (Redis, database) to track recent questions
            pass
        
        return available_questions.sample(n=1).iloc[0]
    
    def get_questions_by_subject(self, subject):
        """Get all questions for a specific subject"""
        if self.df is None:
            raise ValueError("No MCQ data available")
        
        return self.df[self.df['Subject'].str.lower() == subject.lower()]
    
    def get_questions_by_topic(self, topic):
        """Get all questions for a specific topic"""
        if self.df is None:
            raise ValueError("No MCQ data available")
        
        return self.df[self.df['Topic'].str.lower() == topic.lower()]
    
    def get_subjects_list(self):
        """Get list of all unique subjects"""
        if self.df is None:
            raise ValueError("No MCQ data available")
        
        subjects = self.df['Subject'].unique()
        return sorted(subjects.tolist())
    
    def get_topics_list(self, subject=None):
        """Get list of all unique topics, optionally filtered by subject"""
        if self.df is None:
            raise ValueError("No MCQ data available")
        
        if subject:
            filtered_df = self.df[self.df['Subject'].str.lower() == subject.lower()]
            topics = list(set(filtered_df['Topic'].tolist()))
            return sorted(topics)
        
        topics = self.df['Topic'].unique()
        return sorted(topics.tolist())
    
    def validate_question_data(self, question_data):
        """Validate that question data has all required fields"""
        required_fields = [
            'Question Number', 'Subject', 'Topic', 'Question',
            'Option 1', 'Option 2', 'Option 3', 'Option 4',
            'Answer', 'Explanation'
        ]
        
        for field in required_fields:
            if field not in question_data or pd.isna(question_data[field]):
                return False, f"Missing or invalid field: {field}"
        
        # Validate answer is A, B, C, or D
        if question_data['Answer'].upper() not in ['A', 'B', 'C', 'D']:
            return False, f"Invalid answer format: {question_data['Answer']}"
        
        return True, "Valid"
    
    def format_question_for_telegram(self, question_data):
        """Format question data for Telegram message"""
        is_valid, message = self.validate_question_data(question_data)
        if not is_valid:
            raise ValueError(f"Invalid question data: {message}")
        
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
        
        return question_text
    
    def create_answer_keyboard(self, question_data):
        """Create inline keyboard for answer options"""
        keyboard = [
            [
                {"text": "A", "callback_data": f"answer_{question_data['Question Number']}_A_{question_data['Answer']}"},
                {"text": "B", "callback_data": f"answer_{question_data['Question Number']}_B_{question_data['Answer']}"},
                {"text": "C", "callback_data": f"answer_{question_data['Question Number']}_C_{question_data['Answer']}"},
                {"text": "D", "callback_data": f"answer_{question_data['Question Number']}_D_{question_data['Answer']}"}
            ]
        ]
        
        return keyboard
    
    def get_stats(self):
        """Get statistics about the MCQ dataset"""
        if self.df is None:
            return {}
        
        stats = {
            'total_questions': len(self.df),
            'subjects': len(self.df['Subject'].unique()),
            'topics': len(self.df['Topic'].unique()),
            'years': sorted(self.df['Year'].unique().tolist()),
            'questions_by_subject': self.df['Subject'].value_counts().to_dict(),
            'questions_by_topic': self.df['Topic'].value_counts().to_dict()
        }
        
        return stats
