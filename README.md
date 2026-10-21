# AirSense: PM2.5 Air Quality Prediction for South African Cities

AirSense predicts daily PM2.5 (fine particle pollution) for **Johannesburg, Cape Town, Durban and Emalahleni** and turns each prediction into clear health advice.

Built as a final-year project at Tshwane University of Technology.

## Contents

1. [What the project includes](#what-the-project-includes)
2. [Who gets advice](#who-gets-advice)
3. [Tech stack](#tech-stack)
4. [Project folders](#project-folders)
5. [Deployment: how to install and run it](#deployment-how-to-install-and-run-it)
6. [User manual: how to use AirSense](#user-manual-how-to-use-airsense)
7. [Database](#database)
8. [Tests](#tests)
9. [Security notes](#security-notes)
10. [Known limits](#known-limits)
11. [Troubleshooting](#troubleshooting)
12. [Data sources](#data-sources)
13. [Author](#author)

## What the project includes

- **Data analysis (EDA):** daily weather and air quality data for each city, shown in the app's Analysis page.
- **Machine learning:** one model per city, trained and tuned on the project's own data.
- **IoT:** a gateway that collects live readings from an open sensor network (Sensor.Community) near Johannesburg, plus a **clearly labelled simulated sensor** for the other cities.
- **Accounts:** anyone can use every page as a visitor. A registered user can also save forecasts, add notes, delete them, download them as a CSV file, and send a copy to themselves.
- **Full-stack app:** Next.js website, FastAPI backend and PostgreSQL database, all running in Docker.

## Who gets advice

- **Everyone:** what the day's air quality means for normal activity
- **People with asthma**
- **People with heart conditions**
- **People with other lung conditions** (such as COPD)
- **Parents** of young children
- **Runners and outdoor workers**

*The advice is general guidance, not medical advice.*

## Tech stack

| Part | Tool |
|---|---|
| Website | Next.js |
| Backend API | Python, FastAPI |
| Database | PostgreSQL 16 |
| Machine learning | Python, scikit-learn, Jupyter Notebook |
| IoT | Python gateway and simulator |
| Containers | Docker, Docker Compose |
| Tests | pytest |

## Project folders

```
backend/     FastAPI backend, saved city models, and tests (backend/tests)
frontend/    Next.js website
iot/         IoT gateway and sensor simulator
ml/          Model training and tuning scripts
db/init/     Database tables and starting data (runs on a new, empty database)
data/        City air quality CSV files
notebooks/   Jupyter notebooks for the analysis
docs/        Database structure script (airsense_schema.sql)
```

## Deployment: how to install and run it

### What you need

- **Docker Desktop**, installed and running (Windows, macOS or Linux).
- **Git**, to download the project.
- Several GB of free disk space and an internet connection for the first build.

### Steps

1. Download the project:
   ```
   git clone https://github.com/NkunaKJ/airsense-platform.git
   cd airsense-platform
   ```
2. Copy the example settings file and fill in your own values:
   ```
   copy .env.example .env
   ```
   (On macOS or Linux use `cp .env.example .env`.) The file `.env` is private and is never uploaded to GitHub. It holds these settings:

   | Setting | What it is |
   |---|---|
   | `POSTGRES_USER` | The database user name you choose |
   | `POSTGRES_PASSWORD` | The database password you choose |
   | `POSTGRES_DB` | The database name |
   | `IOT_API_KEY` | A secret word the sensor gateway and simulator use to send readings to the backend |

3. Start everything. The first time takes several minutes while Docker builds the images:
   ```
   docker compose up --build
   ```
   To start it in the background instead, use `docker compose up -d --build`.
4. Open in your browser:
   - Website: http://localhost:3000
   - Backend API documentation: http://localhost:8000/docs
   - Backend health check: http://localhost:8000/health

### What happens on the first start

On a brand-new computer the database is empty, so PostgreSQL runs the files in `db/init/` in order: `01_schema_and_data.sql` creates the tables and loads the city data from the `data/` folder, `02_iot.sql` creates the sensor tables, and `03_accounts.sql` creates the account tables. The backend also creates the account tables itself when it starts, so a database that already exists is upgraded without being rebuilt.

### Services

| Service | What it does | Address |
|---|---|---|
| `db` | PostgreSQL 16 database | localhost:5432 (this computer only) |
| `backend` | FastAPI: forecasts, history, sensors, accounts | http://localhost:8000 |
| `frontend` | Next.js website | http://localhost:3000 |
| `gateway` | Collects live readings from Sensor.Community every 5 minutes | no page |
| `simulator` | Sends readings from the clearly labelled simulated sensor | no page |

### Everyday commands

| What you want | Command |
|---|---|
| Start in the background | `docker compose up -d` |
| Stop (keeps all data) | `docker compose stop` |
| See what is running | `docker compose ps` |
| Rebuild after changing backend code | `docker compose up -d --build backend` |
| Rebuild after changing website code | `docker compose up -d --build frontend` |
| Reload after replacing model files only | `docker compose restart backend` |
| Read a service's messages | `docker compose logs backend` |

> **Warning:** never use `docker compose down -v`. The `-v` deletes the database volume, which erases every account and saved forecast. Plain `docker compose down` is safe.

### Back up the database

```
docker compose exec -T db sh -c 'pg_dump -U $POSTGRES_USER -d $POSTGRES_DB -f /tmp/backup.sql'
docker cp airsense-db:/tmp/backup.sql backup.sql
```

### Create the database structure script

```
docker compose exec -T db sh -c 'pg_dump -U $POSTGRES_USER -d $POSTGRES_DB --schema-only --no-owner --no-privileges -f /tmp/airsense_schema.sql'
docker cp airsense-db:/tmp/airsense_schema.sql docs/airsense_schema.sql
```

The model files are already in `backend/models`, so you do not need to retrain anything to run the app. Retraining changes the numbers shown on the Analysis page.

## User manual: how to use AirSense

### Two kinds of user

| | Visitor | Registered user |
|---|---|---|
| Needs an account | No | Yes (free) |
| Prediction, Trends, Compare, Sensors, Analysis, About | Yes | Yes |
| Save forecasts and add notes | No | Yes |
| Edit notes, delete forecasts | No | Yes |
| Download saved forecasts as CSV | No | Yes |
| Send a copy of a forecast to yourself | No | Yes |
| Phone reminder for a forecast | No | Yes |

A visitor sees a small blue note saying they can create a free account. Press **Dismiss** to hide it until the browser tab is closed.

### The screen

The app name is at the top left. **Log in** and **Register** are at the top right, or **Hi, YourName** and **Log out** once you are logged in. The pages are listed in the menu down the left side: Prediction, Trends, Compare, Sensors, Analysis, My forecasts and About.

### Create an account and log in

1. Click **Register** at the top right.
2. Type your name, your email, and a password of at least 8 characters. Type the password again to confirm it.
3. Click **Create account**. You land on the Prediction page and are logged in.
4. Next time, click **Log in**, type your email and password, and click **Log in**.
5. To leave, click **Log out** at the top right.

Your password is never stored. Only a scrambled version is kept.

### Get a forecast (Prediction page)

1. Under **First, choose a city**, open the list and pick a city.
2. Under **Then choose how to get today's conditions**, pick one:
   - **Use today's data:** fetches live air and weather for the city, then predicts tomorrow.
   - **Pick a day from the dataset:** choose a recorded day to see what the model predicted for the next day, and what actually happened.
   - **Enter values manually:** type your own air and weather numbers. A warning appears if they are far from what the city usually sees.
3. Press **Predict**.
4. Read the result: the PM2.5 number, the air quality band, the scale with the typical error, and the factors that pushed the number up or down.
5. Scroll down for the health advice for your group, and the recent days.

### What the bands mean

| Band | Daily average PM2.5 |
|---|---|
| Good | 0 to under 15 µg/m³ |
| Moderate | 15 to under 35 µg/m³ |
| Poor | 35 to under 55 µg/m³ |
| Very poor | 55 µg/m³ and above |

This is AirSense's own scale, not an official South African air quality index.

### Save a forecast (registered users)

1. Make a forecast as above.
2. Under it, type an optional note, for example "planning the school run".
3. Press **Save this forecast**. You see "Saved."
4. A box asks **Send yourself a copy?** (see below).

### Send a copy and set a phone reminder

1. In the **Send yourself a copy?** box, choose **Email me at ...** or **SMS to my phone**, or **No thanks**.
2. For SMS, type a South African mobile number such as 082 123 4567 and press **Send SMS**.
3. To get a reminder, tick **Also set a reminder on my phone**, choose a time, and then send. By email the reminder is attached. By SMS the reminder file downloads. Open the file on your phone and tap **Add to calendar**.
4. Reminders only work for a forecast whose day has not yet passed, for example the "Use today's data" forecast for tomorrow.

> **Demo mode:** in this version, email and SMS do not leave the computer. The box shows exactly what would be sent. Real email can be switched on by adding mail settings to the backend (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`).

### My forecasts (registered users)

Open **My forecasts** in the left menu to see your saved forecasts. Only you can see this list.

- **Edit note:** change the note, press **Save note**. The Send box then appears.
- **Send a copy:** email, SMS or reminder for that forecast.
- **Delete:** press **Delete**, then **Yes, delete** to confirm.
- **Download as CSV:** downloads all your forecasts as a file you can open in Excel.

### The other pages

| Page | What it shows |
|---|---|
| Trends | Choose a city and how far back to look (30 days to everything). Hover over the chart for the date and PM2.5. The history runs to 16 October 2026. |
| Compare | Tomorrow's forecast for all four cities, ranked, with the last week's lines. |
| Sensors | Readings from real sensors near Johannesburg and from the labelled simulated sensors, with South African time. |
| Analysis | How the data and models were checked: monthly patterns, what drives PM2.5, and how each model scored. |
| About | How the forecast works, what the bands mean, limits to keep in mind, and data sources. |

## Database

Nine tables, in four groups. The full script is in `docs/airsense_schema.sql`.

| Group | Tables |
|---|---|
| Air data | `cities`, `observations` |
| Sensors | `devices`, `sensor_readings` |
| Model results | `model_candidates`, `model_results` |
| Accounts | `users`, `sessions`, `saved_forecasts` |

## Tests

The tests are in `backend/tests`. They create their own throwaway users (emails starting with `test-`), and delete them when they finish. Run them from the project folder (PowerShell):

```
docker compose run --rm -v "${PWD}/backend/tests:/app/tests" -v "${PWD}/backend/requirements-dev.txt:/app/requirements-dev.txt" backend sh -c "pip install -q -r requirements-dev.txt && python -m pytest tests -v"
```

The last line should read `51 passed`. The test plan and test cases are in the project documents.

## Security notes

- Passwords are stored only as salted scrypt hashes.
- A login creates a random session token. Only a SHA-256 hash of the token is stored, so a copy of the database cannot be used to log in. Logging out deletes the session on the server. Sessions end by themselves after 7 days.
- Wrong password and unknown email give the same message, so the page does not reveal which emails exist.
- Every saved forecast belongs to one user. A user can only see, change, delete, export or send their own.
- Email is only ever sent to the address on the logged-in account, and each user can send at most 10 messages an hour.
- The `.env` file is not uploaded to GitHub.

## Known limits

- The forecast is a regional model estimate on a grid of about 45 km, not a reading from a station on your street.
- Cape Town is the hardest city to predict.
- The Trends and Analysis pages use a saved dataset that runs to 16 October 2026. The Prediction page fetches live values for today.
- The forecast does not use the sensor readings. The sensors are for information.
- When a forecast is saved, the server checks the values are valid but does not recompute the forecast.
- Email and SMS run in demo mode in this version.
- The message limit is kept in memory and resets when the backend restarts.

## Troubleshooting

| Problem | What to do |
|---|---|
| `docker compose` says it cannot connect | Open Docker Desktop and wait until it says it is running. |
| The page says it cannot reach the AirSense server | Run `docker compose ps`. The `backend` should be running. If not, run `docker compose up -d`. |
| A page shows old styling or old text after a change | Rebuild with `docker compose up -d --build frontend`, then press Ctrl+F5 in the browser. |
| `role "postgres" does not exist` | Your database user is the one in `.env`. Use the commands in this README, which use it automatically. |
| Port 3000, 8000 or 5432 is already in use | Close the other program that uses it, or change the port in `docker-compose.yml`. |
| Predictions with "Use today's data" fail | Check your internet connection. This option fetches live data. |

## Data sources

- Weather and air quality data: Open-Meteo
- Live sensor readings: Sensor.Community

## Author

Nkuna Khanyisa Judith (GitHub: NkunaKJ)
