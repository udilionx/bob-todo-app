import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from database import db, init_db

# Resolve the frontend directory as an absolute path relative to this file,
# using os.path.abspath(__file__) so it works regardless of which directory
# the server is started from.
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend'))

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///todo.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app)

from models import Todo  # noqa: E402

init_db(app)


@app.route('/api/todos', methods=['GET'])
def get_todos():
    todos = Todo.query.all()
    return jsonify([todo.to_dict() for todo in todos])


@app.route('/api/todos', methods=['POST'])
def create_todo():
    data = request.get_json(silent=True) or {}
    if not data.get('title'):
        return jsonify({'error': 'title is required'}), 400
    todo = Todo(
        title=data['title'],
        description=data.get('description'),
    )
    db.session.add(todo)
    db.session.commit()
    return jsonify(todo.to_dict()), 201


@app.route('/api/todos/<int:id>', methods=['PUT'])
def update_todo(id):
    todo = db.session.get(Todo, id)
    if todo is None:
        return jsonify({'error': 'not found'}), 404
    data = request.get_json(silent=True) or {}
    if 'title' in data:
        todo.title = data['title']
    if 'description' in data:
        todo.description = data['description']
    if 'completed' in data:
        todo.completed = data['completed']
    db.session.commit()
    return jsonify(todo.to_dict())


@app.route('/api/todos/<int:id>', methods=['DELETE'])
def delete_todo(id):
    todo = db.session.get(Todo, id)
    if todo is None:
        return jsonify({'error': 'not found'}), 404
    db.session.delete(todo)
    db.session.commit()
    return '', 204


@app.route('/')
def index():
    return send_from_directory(FRONTEND_DIR, 'index.html')


@app.route('/<path:filename>')
def frontend_files(filename):
    """Serve any file (styles.css, app.js, …) from the frontend directory."""
    return send_from_directory(FRONTEND_DIR, filename)


if __name__ == '__main__':
    app.run(debug=True)
