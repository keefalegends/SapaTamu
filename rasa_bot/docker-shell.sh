#!/bin/bash
# ==============================================================================
# Script Interactive Chat Rasa di Linux menggunakan Docker
# ==============================================================================

echo "🚀 [1/2] Menyalakan Rasa Action Server di background..."
docker compose up -d action_server

echo "💬 [2/2] Membuka Interactive Chat Shell SapaTamu..."
docker compose run --rm -p 5005:5005 rasa_server shell --endpoints endpoints.docker.yml
