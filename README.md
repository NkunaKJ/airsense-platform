   # AirSense: PM2.5 Air Quality Prediction for South African Cities

   AirSense predicts daily PM2.5 (fine particle pollution) for **Johannesburg, Cape Town, Durban and Emalahleni** and turns the prediction into simple health advice for groups such as people with asthma, heart or lung conditions, and runners.

    Built as a final-year project at Tshwane University of Technology.

   ## What the project includes

   - **Data analysis (EDA):** daily weather and air quality data for each city, shown in the app's Analysis page
   - **Machine learning:** one model per city, trained and tuned on the project's own data
   - **IoT:** a gateway that collects live readings from an open sensor network (Sensor.Community) near Johannesburg, plus a **clearly labelled simulated sensor** for the other cities
   - **Full-stack app:** Next.js website, FastAPI backend and PostgreSQL database, all running in Docker

   ## Tech stack

   | Part | Tool |
   |---|---|
   | Website | Next.js |
   | Backend API | Python, FastAPI |
   | Database | PostgreSQL 16 |
   | Machine learning | Python, scikit-learn, Jupyter Notebook |
   | IoT | Python gateway and simulator |
   | Containers | Docker, Docker Compose |

   ## Project folders

```
   backend/     FastAPI backend and saved city models
   frontend/    Next.js website
   iot/         IoT gateway and sensor simulator
   ml/          Model training and tuning scripts
   db/init/     Database tables and starting data
   data/        City air quality CSV files
   notebooks/   Jupyter notebooks for the analysis
```

   ## How to run it

   You need **Docker Desktop** installed and running.

   1. Download the project:
```
      git clone https://github.com/NkunaKJ/airsense-platform.git
      cd airsense-platform
```
   2. Copy the example settings file and fill in your own values:
```
      copy .env.example .env
```
   3. Start everything:
```
      docker compose up --build
```
   4. Open in your browser:
      - Website: http://localhost:3000
      - Backend API docs: http://localhost:8000/docs

   ## Data sources

   - Weather and air quality data: Open-Meteo
   - Live sensor readings: Sensor.Community

   ## Author

   Nkuna Khanyisa Judith (GitHub: NkunaKJ)