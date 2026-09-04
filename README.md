# APC Attendance Tracker

A full-stack, responsive web application built to streamline and automate event and attendance management for the APC College Club. Featuring a sleek, modern glassmorphism UI, this application allows club administrators to easily manage multi-day events, track student attendance via a self-service kiosk, and automatically calculate event qualification based on dynamic thresholds.

## ✨ Key Features

- **📊 Centralized Dashboard**: Get a real-time overview of total events and currently active events.
- **📅 Event Management (CRUD)**: Create, view, edit, and delete single-day and multi-day events.
- **🏫 Self-Service Kiosk**: A streamlined interface allowing students to mark their own attendance instantly using their Student ID (SID). Automatically prompts for a student's name only during their first-ever check-in.
- **📈 Advanced Reporting**: Automatically tracks daily attendance for multi-day events and calculates if a student has met the required **40% attendance threshold** to qualify for certification/rewards.
- **📆 Daily Attendance Logs**: Filter and view historical attendance records grouped by specific calendar dates.
- **✍️ Manual Overrides**: Full administrative capabilities to manually add, edit, or delete attendance records for both past and present events, ensuring data accuracy.
- **📱 Fully Responsive Design**: An immersive glassmorphism interface that works flawlessly across desktop, tablet, and mobile devices.

## 🛠️ Technology Stack

**Frontend:**
- HTML5 & CSS3 (Custom Variables, Flexbox/Grid layouts)
- Vanilla JavaScript (DOM manipulation, Fetch API)
- Responsive Mobile-First Design

**Backend:**
- Node.js
- Express.js (RESTful API architecture)

**Database:**
- MongoDB (NoSQL Database)
- Mongoose (ODM)

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v14 or higher)
- [MongoDB](https://www.mongodb.com/try/download/community) (Local instance or Atlas URI)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/apc-attendance.git
   cd apc-attendance
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add your MongoDB connection string:
   ```env
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1:27017/apc_attendance
   ```

4. **Start the server:**
   ```bash
   node server.js
   ```

5. **Open the App:**
   Visit `http://localhost:3000` in your browser.

## 📁 Project Structure

```text
apc-attendance/
├── models/
│   ├── Attendance.js    # Mongoose schema for attendance records
│   ├── Event.js         # Mongoose schema for club events
│   └── Member.js        # Mongoose schema for student profiles
├── public/
│   ├── index.html       # Main UI structure
│   ├── script.js        # Frontend logic and API integration
│   ├── style.css        # Glassmorphism styling and responsiveness
│   └── APCLogoColor.webp # Club Logo
├── server.js            # Express application entry point & API Routes
├── package.json         # Project metadata and dependencies
└── README.md            # Project documentation
```

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
Feel free to check [issues page](https://github.com/yourusername/apc-attendance/issues) if you want to contribute.

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
