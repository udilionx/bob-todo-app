"""Unit tests for the Todo REST API endpoints.

Each test function is self-contained: it uses an in-memory SQLite database
created fresh for the test session and tears it down afterwards.
"""

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def app():
    """Create a Flask app configured for testing with an in-memory DB."""
    import sys
    import os
    # Ensure the todo-app package root is importable regardless of where
    # pytest is invoked from.
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

    from app import app as flask_app
    from database import db

    flask_app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI="sqlite:///:memory:",
    )

    with flask_app.app_context():
        db.create_all()
        yield flask_app
        db.drop_all()


@pytest.fixture(scope="module")
def client(app):
    """Return a test client for the app."""
    return app.test_client()


@pytest.fixture(autouse=True)
def clean_db(app):
    """Truncate the todo table before every individual test."""
    from database import db
    from models import Todo

    with app.app_context():
        db.session.query(Todo).delete()
        db.session.commit()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _create(client, title="Test todo", description=None):
    """POST a new todo and return the response."""
    payload = {"title": title}
    if description is not None:
        payload["description"] = description
    return client.post("/api/todos", json=payload)


# ---------------------------------------------------------------------------
# GET /api/todos
# ---------------------------------------------------------------------------

class TestGetTodos:
    def test_returns_empty_list_when_no_todos(self, client):
        res = client.get("/api/todos")
        assert res.status_code == 200
        assert res.get_json() == []

    def test_returns_list_with_one_todo(self, client):
        _create(client, title="Buy bread")
        res = client.get("/api/todos")
        data = res.get_json()
        assert res.status_code == 200
        assert len(data) == 1
        assert data[0]["title"] == "Buy bread"

    def test_returns_all_todos(self, client):
        _create(client, title="Task A")
        _create(client, title="Task B")
        _create(client, title="Task C")
        res = client.get("/api/todos")
        assert res.status_code == 200
        assert len(res.get_json()) == 3

    def test_todo_shape(self, client):
        _create(client, title="Shape check", description="A description")
        data = client.get("/api/todos").get_json()
        todo = data[0]
        assert set(todo.keys()) == {"id", "title", "description", "completed", "created_at"}
        assert todo["completed"] is False
        assert todo["description"] == "A description"


# ---------------------------------------------------------------------------
# POST /api/todos
# ---------------------------------------------------------------------------

class TestCreateTodo:
    def test_creates_todo_with_title_only(self, client):
        res = _create(client, title="Buy milk")
        assert res.status_code == 201
        body = res.get_json()
        assert body["title"] == "Buy milk"
        assert body["description"] is None
        assert body["completed"] is False
        assert "id" in body
        assert "created_at" in body

    def test_creates_todo_with_description(self, client):
        res = _create(client, title="Buy milk", description="Whole milk")
        assert res.status_code == 201
        assert res.get_json()["description"] == "Whole milk"

    def test_missing_title_returns_400(self, client):
        res = client.post("/api/todos", json={})
        assert res.status_code == 400
        assert "error" in res.get_json()

    def test_empty_title_returns_400(self, client):
        res = client.post("/api/todos", json={"title": ""})
        assert res.status_code == 400

    def test_non_json_body_returns_400(self, client):
        res = client.post("/api/todos", data="not json",
                          content_type="text/plain")
        assert res.status_code == 400

    def test_created_todo_appears_in_list(self, client):
        _create(client, title="Unique title xyz")
        titles = [t["title"] for t in client.get("/api/todos").get_json()]
        assert "Unique title xyz" in titles


# ---------------------------------------------------------------------------
# PUT /api/todos/<id>
# ---------------------------------------------------------------------------

class TestUpdateTodo:
    def test_update_title(self, client):
        todo_id = _create(client, title="Old title").get_json()["id"]
        res = client.put(f"/api/todos/{todo_id}", json={"title": "New title"})
        assert res.status_code == 200
        assert res.get_json()["title"] == "New title"

    def test_update_description(self, client):
        todo_id = _create(client, title="Task").get_json()["id"]
        res = client.put(f"/api/todos/{todo_id}", json={"description": "Updated desc"})
        assert res.status_code == 200
        assert res.get_json()["description"] == "Updated desc"

    def test_mark_completed(self, client):
        todo_id = _create(client, title="Task").get_json()["id"]
        res = client.put(f"/api/todos/{todo_id}", json={"completed": True})
        assert res.status_code == 200
        assert res.get_json()["completed"] is True

    def test_mark_uncompleted(self, client):
        todo_id = _create(client, title="Task").get_json()["id"]
        client.put(f"/api/todos/{todo_id}", json={"completed": True})
        res = client.put(f"/api/todos/{todo_id}", json={"completed": False})
        assert res.status_code == 200
        assert res.get_json()["completed"] is False

    def test_partial_update_preserves_other_fields(self, client):
        todo_id = _create(client, title="Original", description="Desc").get_json()["id"]
        res = client.put(f"/api/todos/{todo_id}", json={"completed": True})
        body = res.get_json()
        assert body["title"] == "Original"
        assert body["description"] == "Desc"

    def test_update_all_fields_at_once(self, client):
        todo_id = _create(client, title="Old").get_json()["id"]
        res = client.put(f"/api/todos/{todo_id}",
                         json={"title": "New", "description": "New desc", "completed": True})
        body = res.get_json()
        assert body["title"] == "New"
        assert body["description"] == "New desc"
        assert body["completed"] is True

    def test_update_nonexistent_returns_404(self, client):
        res = client.put("/api/todos/99999", json={"title": "Ghost"})
        assert res.status_code == 404
        assert "error" in res.get_json()

    def test_empty_body_is_a_noop(self, client):
        todo_id = _create(client, title="Stable").get_json()["id"]
        res = client.put(f"/api/todos/{todo_id}", json={})
        assert res.status_code == 200
        assert res.get_json()["title"] == "Stable"


# ---------------------------------------------------------------------------
# DELETE /api/todos/<id>
# ---------------------------------------------------------------------------

class TestDeleteTodo:
    def test_delete_returns_204(self, client):
        todo_id = _create(client, title="To delete").get_json()["id"]
        res = client.delete(f"/api/todos/{todo_id}")
        assert res.status_code == 204
        assert res.data == b""

    def test_deleted_todo_is_gone(self, client):
        todo_id = _create(client, title="Gone").get_json()["id"]
        client.delete(f"/api/todos/{todo_id}")
        ids = [t["id"] for t in client.get("/api/todos").get_json()]
        assert todo_id not in ids

    def test_delete_nonexistent_returns_404(self, client):
        res = client.delete("/api/todos/99999")
        assert res.status_code == 404
        assert "error" in res.get_json()

    def test_delete_only_removes_target(self, client):
        id_a = _create(client, title="Keep A").get_json()["id"]
        id_b = _create(client, title="Remove B").get_json()["id"]
        client.delete(f"/api/todos/{id_b}")
        ids = [t["id"] for t in client.get("/api/todos").get_json()]
        assert id_a in ids
        assert id_b not in ids


# ---------------------------------------------------------------------------
# GET /  (serves index.html)
# ---------------------------------------------------------------------------

class TestIndexRoute:
    def test_index_returns_200(self, client):
        res = client.get("/")
        assert res.status_code == 200

    def test_index_returns_html(self, client):
        res = client.get("/")
        assert b"<!DOCTYPE html>" in res.data or b"<!doctype html>" in res.data.lower()
