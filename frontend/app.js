/**
 * app.js — Todo App frontend logic
 *
 * This file handles all communication with the Flask REST API and manages
 * the DOM (what the user sees on the page). It is the only JavaScript file
 * in the app — no libraries or frameworks are used.
 *
 * High-level flow:
 *   1. When the page loads, we fetch all existing todos from the server.
 *   2. We render each todo as an <li> card in the list.
 *   3. User actions (add / complete / delete) each make an API call and then
 *      update the DOM to reflect the result — without reloading the page.
 */

// ── Global state ───────────────────────────────────────────────────────────

/**
 * The base URL for every API request. Because the frontend is served by the
 * same Flask server, we can use a relative path — no need to hard-code
 * "http://127.0.0.1:5000". If the server moves, only this line changes.
 */
const API = '/api/todos';

/**
 * In-memory copy of all todos fetched from the server.
 * We keep this array so we can filter/count todos without hitting the API
 * on every interaction. It stays in sync with the server after each mutation.
 */
let allTodos = [];

/**
 * Which filter tab is currently active: 'all' | 'active' | 'completed'.
 * Defaults to 'all' so every todo is visible when the page first loads.
 */
let activeFilter = 'all';

// ── API helper ─────────────────────────────────────────────────────────────

/**
 * A single reusable wrapper around the browser's built-in `fetch` API.
 *
 * WHY async/await?
 * ----------------
 * Network requests take time — the browser can't pause and wait for them
 * without freezing the page. JavaScript handles this with "Promises": objects
 * that represent a value that will arrive in the future.
 *
 * `async/await` is syntactic sugar over Promises that makes asynchronous code
 * read like normal, top-to-bottom code:
 *
 *   // Without async/await (Promise chaining — harder to read):
 *   fetch(url).then(res => res.json()).then(data => console.log(data));
 *
 *   // With async/await (same thing — easier to read):
 *   const res = await fetch(url);
 *   const data = await res.json();
 *   console.log(data);
 *
 * Any function marked `async` always returns a Promise. Inside it, `await`
 * pauses *only that function* until the awaited Promise resolves — the rest
 * of the page keeps running normally.
 *
 * HOW ERROR HANDLING WORKS
 * ------------------------
 * We use try/catch. If anything inside `try` throws (e.g. no internet, server
 * returns an error status), execution jumps to `catch` where we can show the
 * user a message instead of silently failing.
 *
 * This function centralises three concerns so every caller gets them for free:
 *   1. Always send JSON headers so Flask knows how to parse our request body.
 *   2. Treat HTTP 204 No Content (used by DELETE) as a successful empty response.
 *   3. Convert any non-2xx HTTP status into a thrown Error with the server's
 *      error message, so callers don't have to check `res.ok` themselves.
 *
 * @param {string} url     - The URL to request (e.g. '/api/todos' or '/api/todos/1').
 * @param {object} options - Optional fetch options: method, body, etc.
 *                           Merged on top of the default { headers } object.
 * @returns {Promise<object|null>} Parsed JSON body, or null for 204 responses.
 */
async function apiRequest(url, options = {}) {
  // `fetch` sends the HTTP request. `await` pauses here until the response
  // headers arrive (the body may still be streaming at this point).
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' }, // tell the server we're sending JSON
    ...options, // spread in any caller-supplied options (method, body, etc.)
  });

  // HTTP 204 = "No Content" — a successful response with no body (used by DELETE).
  // Calling res.json() on an empty body would throw, so we return null early.
  if (res.status === 204) return null;

  // res.ok is true for any 2xx status code (200, 201, etc.).
  // If it's false (400, 404, 500, …), we extract the server's error message
  // from the JSON body and throw it so the calling function's catch block
  // can display it to the user.
  if (!res.ok) {
    // .catch(() => ({})) guards against the rare case where the error response
    // body isn't valid JSON — we fall back to an empty object so the || below
    // produces a generic message.
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }

  // For successful responses with a body, parse and return the JSON.
  // `await` is needed here too because reading the response body is also async.
  return res.json();
}

// ── Toast notification ─────────────────────────────────────────────────────

/**
 * Shows a temporary error message at the bottom of the screen (a "toast").
 *
 * This gives the user feedback when an API call fails (e.g. server is down)
 * without interrupting their workflow with a blocking alert() dialog.
 *
 * Only one toast is shown at a time — if one is already visible it is removed
 * before the new one is added, preventing stacking.
 *
 * The CSS animation and auto-removal after 3.5 seconds are defined in styles.css.
 *
 * @param {string} message - The error text to display.
 */
function showToast(message) {
  // Remove any existing toast to avoid duplicates stacking up.
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  // Create a new <div>, style it with the 'toast' class (defined in styles.css),
  // add it to the page, then schedule its removal after 3.5 seconds.
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Render helpers ─────────────────────────────────────────────────────────

/**
 * Updates the "N remaining" counter in the filter bar.
 *
 * Counts todos in the in-memory `allTodos` array (not the filtered view) so
 * the count always reflects the true total of incomplete todos regardless of
 * which filter tab is active.
 */
function updateCount() {
  // Array.filter returns a new array containing only items where the callback
  // returns true. We count items where completed is false (i.e. still active).
  const active = allTodos.filter((t) => !t.completed).length;
  const countEl = document.getElementById('todo-count');
  countEl.textContent = `${active} remaining`;
}

/**
 * Returns the subset of `allTodos` that matches the currently active filter.
 *
 * We separate filtering from rendering so both `renderList` and the delete
 * handler can ask "what's visible right now?" without duplicating logic.
 *
 * @returns {Array} The filtered list of todo objects.
 */
function getFilteredTodos() {
  if (activeFilter === 'active')    return allTodos.filter((t) => !t.completed);
  if (activeFilter === 'completed') return allTodos.filter((t) => t.completed);
  return allTodos; // 'all' — no filtering needed
}

/**
 * Builds and returns a single <li> DOM element for one todo item.
 *
 * We create elements programmatically (createElement) rather than using
 * innerHTML strings to avoid XSS risks — if a todo title contained HTML like
 * `<script>alert('x')</script>`, setting .textContent escapes it safely,
 * whereas innerHTML would execute it.
 *
 * The returned <li> is not yet attached to the page — renderList() does that.
 *
 * @param {object} todo - A todo object from the API: { id, title, description, completed, created_at }
 * @returns {HTMLElement} A fully wired <li> element ready to insert into the DOM.
 */
function renderTodo(todo) {
  // The <li> card — add a visual class if the todo is already completed.
  const li = document.createElement('li');
  if (todo.completed) li.classList.add('completed-item');

  // ── Checkbox ──────────────────────────────────────────────────────────────
  // Clicking the checkbox calls toggleComplete(), which sends a PUT request
  // to update the server, then updates the DOM if the request succeeds.
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'todo-checkbox';
  checkbox.checked = todo.completed; // reflect server state on initial render
  // aria-label makes the checkbox understandable to screen readers.
  checkbox.setAttribute('aria-label', `Mark "${todo.title}" as ${todo.completed ? 'active' : 'completed'}`);
  // We pass references to the DOM elements so toggleComplete can update them
  // directly without having to re-query the DOM.
  checkbox.addEventListener('change', () => toggleComplete(todo, checkbox, li, titleEl));

  // ── Text block ────────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.className = 'todo-body';

  const titleEl = document.createElement('span');
  titleEl.className = 'todo-title' + (todo.completed ? ' done' : ''); // strikethrough if done
  titleEl.textContent = todo.title; // .textContent safely escapes HTML characters
  body.appendChild(titleEl);

  // Description is optional — only render the element if the field has a value.
  if (todo.description) {
    const descEl = document.createElement('p');
    descEl.className = 'todo-description';
    descEl.textContent = todo.description;
    body.appendChild(descEl);
  }

  // ── Delete button ─────────────────────────────────────────────────────────
  // Clicking ✕ sends a DELETE request; on success the <li> is removed from
  // the DOM. The todo.id is captured in the closure so the handler always
  // refers to the correct record even if the list is re-rendered later.
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.textContent = '✕';
  deleteBtn.setAttribute('aria-label', `Delete "${todo.title}"`);
  deleteBtn.addEventListener('click', () => deleteTodo(todo.id, li));

  // Assemble: checkbox | text block | delete button
  li.append(checkbox, body, deleteBtn);
  return li;
}

/**
 * Clears the todo list in the DOM and re-renders it from the in-memory
 * `allTodos` array, applying the current filter.
 *
 * This is a full re-render — we wipe `list.innerHTML` and rebuild from
 * scratch. For a small todo list this is fast and keeps the logic simple.
 * A larger app might use a virtual DOM (React, etc.) for efficiency.
 *
 * Also toggles the empty-state message and refreshes the item count.
 */
function renderList() {
  const list       = document.getElementById('todo-list');
  const emptyState = document.getElementById('empty-state');
  const filtered   = getFilteredTodos();

  // Wipe existing list items, then rebuild from the filtered array.
  list.innerHTML = '';
  filtered.forEach((todo) => list.appendChild(renderTodo(todo)));

  // classList.toggle(name, force) adds the class when force is false,
  // removes it when force is true — so 'hidden' is removed when there ARE
  // items and added back when the list is empty.
  emptyState.classList.toggle('hidden', filtered.length > 0);

  updateCount();
}

// ── API actions ────────────────────────────────────────────────────────────

/**
 * Fetches all todos from GET /api/todos and populates the page.
 *
 * Called once on page load. The server returns an array of todo objects:
 *   [{ id, title, description, completed, created_at }, …]
 *
 * We store the array in `allTodos` (the in-memory cache) then call renderList()
 * to draw them. If the request fails (e.g. server not running), we show a toast.
 */
async function loadTodos() {
  try {
    // GET /api/todos — no options needed; apiRequest defaults to GET.
    allTodos = await apiRequest(API);
    renderList();
  } catch (e) {
    showToast('Failed to load todos.');
  }
}

/**
 * Sends a new todo to POST /api/todos and adds it to the top of the list.
 *
 * The request body is JSON: { title, description }
 * The server validates that title is present, then creates the record and
 * returns the full todo object (including the auto-generated id and created_at).
 *
 * On success we `unshift` (prepend) the new todo into `allTodos` so it appears
 * at the top of the list, then re-render.
 *
 * @param {string} title       - The todo title (required by the server).
 * @param {string} description - Optional description text.
 */
async function createTodo(title, description) {
  try {
    const todo = await apiRequest(API, {
      method: 'POST',
      // JSON.stringify converts the JS object to a JSON string for the HTTP body.
      // We omit description entirely (undefined) if it's blank — the server
      // stores null for todos created without one.
      body: JSON.stringify({ title, description: description || undefined }),
    });
    allTodos.unshift(todo); // prepend to the local cache
    renderList();
  } catch (e) {
    // e.message was set by apiRequest from the server's { error: "..." } JSON,
    // e.g. "title is required" for a 400 response.
    showToast(e.message || 'Failed to create todo.');
  }
}

/**
 * Toggles a todo's completed state via PUT /api/todos/<id>.
 *
 * Called when the user clicks a checkbox. We immediately read the new checkbox
 * state (true/false) and send it to the server. Only after the server confirms
 * success do we update the DOM — this prevents the UI from lying to the user
 * if the request fails.
 *
 * If the request fails, we revert the checkbox to its previous state and show
 * a toast — this is called "optimistic revert" (the opposite of "optimistic
 * update", where you'd update the UI before the server responds).
 *
 * @param {object}      todo     - The in-memory todo object to update.
 * @param {HTMLElement} checkbox - The checkbox element that was clicked.
 * @param {HTMLElement} li       - The <li> card element for CSS class toggling.
 * @param {HTMLElement} titleEl  - The title <span> for strikethrough toggling.
 */
async function toggleComplete(todo, checkbox, li, titleEl) {
  const completed = checkbox.checked; // capture the intended new state
  try {
    // PUT /api/todos/<id> with just the field we're changing.
    // The server applies partial updates — other fields (title, description)
    // are left untouched.
    const updated = await apiRequest(`${API}/${todo.id}`, {
      method: 'PUT',
      body: JSON.stringify({ completed }),
    });

    // Update the in-memory object so our local cache stays in sync.
    todo.completed = updated.completed;

    // Update the visual state: add/remove strikethrough on the title and the
    // faded-out style on the card.
    titleEl.classList.toggle('done', updated.completed);
    li.classList.toggle('completed-item', updated.completed);

    // If the user is on the 'active' or 'completed' filter, a just-toggled item
    // should disappear from the current view — a full re-render handles that.
    if (activeFilter !== 'all') renderList();

    updateCount();
  } catch (e) {
    // Revert the checkbox visually — the server didn't accept the change, so
    // the UI should reflect the actual server state (the opposite of what was
    // just checked).
    checkbox.checked = !completed;
    showToast('Failed to update todo.');
  }
}

/**
 * Deletes a todo via DELETE /api/todos/<id> and removes its card from the DOM.
 *
 * On success:
 *   1. Remove the todo from the local `allTodos` cache (Array.filter).
 *   2. Remove the <li> element from the DOM directly (li.remove()) — faster
 *      than a full re-render since we already have a reference to the element.
 *   3. Show the empty-state message if no filtered todos remain.
 *   4. Refresh the counter.
 *
 * On failure, show a toast — the <li> stays in the DOM because the server
 * didn't actually delete the record.
 *
 * @param {number}      id - The todo's id from the server.
 * @param {HTMLElement} li - The <li> element to remove on success.
 */
async function deleteTodo(id, li) {
  try {
    // DELETE returns HTTP 204 (no body) on success; apiRequest returns null.
    await apiRequest(`${API}/${id}`, { method: 'DELETE' });

    // Remove from the local cache using Array.filter (non-destructive —
    // returns a new array without the deleted item).
    allTodos = allTodos.filter((t) => t.id !== id);

    // Remove the card from the page without re-rendering the whole list.
    li.remove();

    // Show empty state if there's nothing left to display in the current filter.
    const emptyState = document.getElementById('empty-state');
    emptyState.classList.toggle('hidden', getFilteredTodos().length > 0);

    updateCount();
  } catch (e) {
    showToast('Failed to delete todo.');
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

/**
 * DOMContentLoaded fires when the browser has fully parsed the HTML and built
 * the DOM tree, but before images and stylesheets have finished loading.
 *
 * We wait for this event before running any DOM queries (getElementById, etc.)
 * to guarantee the elements we reference actually exist. The `defer` attribute
 * on the <script> tag in index.html also ensures this, but listening for the
 * event is a safe belt-and-suspenders practice.
 *
 * Everything inside this callback is the app's entry point:
 *   - Load existing todos from the server.
 *   - Wire up the "Add" form submit handler.
 *   - Wire up the filter tab buttons.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Fetch and render all todos on page load.
  loadTodos();

  // ── "Add" form submit ──────────────────────────────────────────────────────
  document.getElementById('add-form').addEventListener('submit', (e) => {
    // e.preventDefault() stops the browser's default form behaviour, which
    // would normally reload the page and send data as a query string.
    // We want to handle the submission ourselves via fetch instead.
    e.preventDefault();

    const titleInput = document.getElementById('title-input');
    const descInput  = document.getElementById('description-input');

    // .trim() removes leading/trailing whitespace so "  " is treated as empty.
    const title = titleInput.value.trim();

    // Client-side validation: don't bother hitting the API if title is blank.
    // We also highlight the input in red ('error' class) to guide the user.
    if (!title) {
      titleInput.classList.add('error');
      titleInput.focus();
      return; // exit the handler early — do nothing else
    }
    titleInput.classList.remove('error');

    // Fire the API call (async — doesn't block the UI).
    createTodo(title, descInput.value.trim());

    // Clear both inputs and return focus to the title field so the user can
    // quickly type the next todo without clicking.
    titleInput.value = '';
    descInput.value  = '';
    titleInput.focus();
  });

  // Remove the red error border as soon as the user starts typing in the title
  // field — giving instant feedback that the validation has been cleared.
  document.getElementById('title-input').addEventListener('input', (e) => {
    e.target.classList.remove('error');
  });

  // ── Filter buttons ─────────────────────────────────────────────────────────
  // querySelectorAll returns a NodeList of every element matching the selector.
  // We iterate it with forEach to attach a click listener to each button.
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      // Deactivate all buttons, then activate only the clicked one.
      // This updates the visual highlight (blue background via the 'active' class).
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      // btn.dataset.filter reads the `data-filter` attribute from the HTML:
      // <button data-filter="active"> → btn.dataset.filter === 'active'
      activeFilter = btn.dataset.filter;

      // Re-render the list with the new filter applied.
      renderList();
    });
  });
});
