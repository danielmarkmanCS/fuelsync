# FuelSync - Hybrid Athlete OS

## Project Overview
A full-stack application designed for Hybrid Athletes to synchronize nutrition (macro-cycling), training loads, and environmental factors (weather/location). 

## Tech Stack
- **Frontend:** React Native (Expo) + TypeScript.
- **Styling:** NativeWind (Tailwind CSS).
- **Backend:** Node.js (Express) hosted via Cloudflare Tunnels.
- **Database:** PostgreSQL (with AES-256 encryption for sensitive health data).
- **State Management:** TanStack Query & Zustand.

## Hybrid Protocol Logic (Core Business Rules)
- **Nutrition Cycling:**
  - **Rest Day:** High Fat, Moderate Protein, Low Carb.
  - **Strength Day:** High Protein, Moderate Carb, Moderate Fat.
  - **Cardio Day:** High Carb, Moderate Protein, Low Fat.
- **Environmental Safety:**
  - If Humidity > 80% or Temp > 30°C: Trigger "Dehydration Alert" and suggest indoor training or pace adjustment.
- **Location Intelligence:** - Identify nearby gyms or outdoor workout parks via Google Maps SDK.

## Project Structure
- `/apps/mobile`: Expo React Native application.
- `/server`: Node.js backend API.
- `/shared`: Common TypeScript interfaces and validation schemas.

## Commands
### Development
- `npm install` - Install all dependencies.
- `npx expo start` - Start Expo development server.
- `npm run dev:server` - Start backend with nodemon.
### Maintenance
- `npm run lint` - Run ESLint.
- `npx tsc --noEmit` - Run type checking.

## Coding Standards & Security
- **Security:** Use Environment Variables for all secrets (OpenWeather, Google Maps, DB_URL). No PII (Personally Identifiable Information) in logs.
- **Components:** Functional components with TypeScript interfaces.
- **Architecture:** Feature-based folder structure. Logic isolated in `/services` or `/hooks`.
- **UI:** Maintain high contrast for outdoor visibility (running mode).
