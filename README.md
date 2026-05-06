# Climate Reanalysis
Replacement for the abandoned PSL interactive climate query tools for daily, weekly, and monthly climate anomaly and normals analysis

# Proposed Stack

| Feature       | Backend (Python) | Frontend (React)          |
| ------------- | ---------------- | ------------------------- |
| Framework     | FastAPI          | React + TypeScript + Vite |
| Data Access   | Xarray + OPeNDAP | Axios / React Query       |
| Calculation   | NumPy            | N/A                       |
| Map Rendering | N/A              | Deck.gl or react-map-gl   |

---

# Monorepo Structure

```txt
climate-reanalysis/
  frontend/
  backend/
    .venv/
    pyproject.toml
    uv.lock
    app/
      __init__.py
      main.py
```

---

# Development

## Backend

### Stack

* Python 3.12
* uv
* FastAPI
* uvicorn
* requests

### Environment

Project-local virtual environment:

```txt
backend/.venv
```

WebStorm interpreter:

```txt
backend/.venv/bin/python
```

### Install Dependencies

```bash
cd backend

uv add fastapi uvicorn requests
```

### Run Python Script

```bash
uv run python app/main.py
```

### Run FastAPI Server

```bash
uv run uvicorn app.main:app --reload
```

### FastAPI App

`app/main.py`

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "Hello from backend!"}
```

### Local Backend URL

```txt
http://127.0.0.1:8000
```

### Dependency Files

Managed by uv:

```txt
pyproject.toml
uv.lock
```

No `requirements.txt` currently used.

---

## Frontend

### Stack

* React
* TypeScript
* Vite

### React vs Next.js

FastAPI provides the backend API layer, so Next.js server features are currently unnecessary.

Routing can be handled with React Router if needed.

Can migrate to Next.js later if SSR or server-side routing becomes necessary.

### Install Dependencies

```bash
cd frontend

npm install
```

### Run Frontend

```bash
npm run dev
```

### Local Frontend URL

```txt
http://localhost:5173
```

---

# Run Development Environment

## Terminal 1 - Backend

```bash
cd backend
uv run uvicorn app.main:app --reload
```

## Terminal 2 - Frontend

```bash
cd frontend
npm run dev
```

---

# Planned Infrastructure

* Dockerized frontend/backend services
* Shared docker-compose development environment
* Possible nginx reverse proxy
* Climate data caching layer
* Async background processing for larger climate calculations

---

# Notes

* Frontend dependencies are managed with npm.
* Backend dependencies are managed with uv.
* Backend virtual environment lives in `backend/.venv/`.
* `.venv/` and `node_modules/` should not be committed.
* Numerical and climate calculations should remain on the backend.
* Frontend should primarily handle rendering, interaction, and visualization.
