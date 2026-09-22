# Google Sheets ↔ Web Synchronization App

A full-stack web application that synchronizes data between Google Sheets and a web interface.

The application uses React for the frontend, Node.js/Express as an API gateway, Python/FastAPI for Google Sheets integration, and the Google Sheets API for spreadsheet communication.

## Architecture

React Frontend
      ↓
Node.js / Express API
      ↓
Python / FastAPI Service
      ↓
Google Sheets API
      ↓
Google Sheets

The application supports two-way synchronization:

Website → Google Sheets

Google Sheets → Website

The frontend polls the backend every 2 seconds to detect updates made directly in Google Sheets.

## Technologies

- React
- Vite
- Node.js
- Express.js
- Python
- FastAPI
- Google Sheets API
- Google Service Account
- JavaScript
- REST APIs

## Features

- Display Google Sheet data on a web interface
- Edit spreadsheet data through the website
- Submit changes to Google Sheets
- Automatically detect changes made directly in Google Sheets
- 2-second polling interval
- Three-column spreadsheet structure
- API health monitoring
- Error handling
- CORS support
- Separation between frontend, Node.js API and Python service

## Spreadsheet Structure

The application uses three columns:

| Column | Purpose |
|---|---|
| A | Name |
| B | Role |
| C | Status |

Example:

| Name | Role | Status |
|---|---|---|
| Alpha | UI | Active |
| Bravo | Developer | Active |
| Charlie | Tester | Active |
| Delta | Support | Inactive |

## Project Structure

```text
google-sheets-sync-app/
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.js
│
├── node-api/
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
├── python-service/
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
│
├── README.md
└── .gitignore