@echo off
echo ===================================================
echo [SAPATAMU AI] Training Model Rasa AI Chatbot...
echo ===================================================
cd /d "%~dp0..\rasa_bot"
call venv\Scripts\activate.bat
rasa train
pause
