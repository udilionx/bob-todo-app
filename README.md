# Todo App

A full-stack todo application with a **Python Flask** REST API backend and a **vanilla JavaScript** frontend. Data is persisted in a local **SQLite** database via SQLAlchemy. No frontend framework or build step required.

---

## Project Structure

```
todo-app/
├── backend/                  # Flask REST API
│   ├── app.py                # Application entry point, routes, CORS
│   ├── models.py             # SQLAlchemy Todo model
│   ├── database.py           # DB instance and initialisation helper
│   ├── requirements.txt      # Python dependencies
│   └── tests/
│       └── test_api.py       # Unit tests (pytest, 98% coverage)
└── frontend/                 # Vanilla JS single-page app
    ├── index.html            # HTML shell
    ├── styles.css            # Responsive CSS
    └── app.js                # Fetch-based API client and DOM logic
```

---

## Tech Stack

| Layer    | Technology              |
|----------|-------------------------|
| Backend  | Python 3, Flask 3       |
| ORM      | Flask-SQLAlchemy 3      |
| Database | SQLite (file-based)     |
| CORS     | Flask-CORS              |
| Frontend | Vanilla JS (ES6), HTML5 |
| Tests    | pytest, pytest-cov      |

---

## Getting Started

### Prerequisites

- Python 3.9+

### 1. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Start the server

```bash
python app.py
```

The server starts at **http://127.0.0.1:5000**.  
Open that URL in your browser to use the app.

---

## API Endpoints

| Method   | Path              | Description             | Success |
|----------|-------------------|-------------------------|---------|
| `GET`    | `/api/todos`      | List all todos           | 200     |
| `POST`   | `/api/todos`      | Create a new todo        | 201     |
| `PUT`    | `/api/todos/<id>` | Update a todo by id      | 200     |
| `DELETE` | `/api/todos/<id>` | Delete a todo by id      | 204     |
| `GET`    | `/`               | Serve the frontend app   | 200     |

### Todo object shape

```json
{
  "id": 1,
  "title": "Buy groceries",
  "description": "Milk, eggs, bread",
  "completed": false,
  "created_at": "2024-01-01T10:00:00"
}
```

### Example curl commands

```bash
# List all todos
curl http://127.0.0.1:5000/api/todos

# Create a todo
curl -X POST http://127.0.0.1:5000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"Buy groceries","description":"Milk, eggs, bread"}'

# Mark as completed
curl -X PUT http://127.0.0.1:5000/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"completed":true}'

# Delete a todo
curl -X DELETE http://127.0.0.1:5000/api/todos/1
```

---

## Running Tests

```bash
cd backend
python -m pytest tests/test_api.py -v --cov=app --cov=models --cov=database --cov-report=term-missing
```

Expected output: **24 passed, 98% coverage**.

---

## Frontend Features

- Add todos with an optional description
- Mark todos complete / incomplete with a checkbox
- Delete todos
- Filter by **All / Active / Completed**
- Live "N remaining" counter
- Error toast notifications on API failure
- Responsive layout for mobile and desktop
