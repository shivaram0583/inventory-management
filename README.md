# Inventory Management System

A comprehensive inventory management system for Shri Lakshmi Vigneswara Traders, a business dealing in seeds and fertilizers.

## Features

### Core Functionality
- **Inventory Management**: Add, edit, delete products and manage stock levels
- **Sales Management**: Process sales with automatic stock deduction
- **Receipt Generation**: Generate printable receipts for all transactions
- **Reporting & Analytics**: Daily sales reports, inventory status, and performance analytics
- **Role-based Access**: Admin and Operator roles with appropriate permissions

### User Roles
- **Business Owner (Admin)**: Full control over inventory, users, and reports
- **Shop In-Charge (Operator)**: Manage daily sales and view inventory

### Key Features
- Real-time stock monitoring with low stock alerts
- Date-based sales tracking and filtering
- Product search and categorization (Seeds/Fertilizers)
- Comprehensive reporting with multiple views
- Modern, responsive UI built with React and Tailwind CSS

## Tech Stack

### Backend
- **Node.js** with Express.js
- **SQLite** database
- **JWT** authentication
- **bcryptjs** for password hashing

### Frontend
- **React 18** with React Router
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **Axios** for API calls
- **React-to-print** for receipt printing

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd inventory-management-system
   ```

2. **Install dependencies**
   ```bash
   npm run install-deps
   ```
   Or install manually:
   ```bash
   npm install
   cd server && npm install
   cd ../client && npm install
   ```

3. **Environment Setup**
   - Navigate to `server/` directory
   - Create `.env` file (already provided with default values)
   - Update `JWT_SECRET` with a secure secret key for production

4. **Start the application**
   ```bash
   npm run dev
   ```
   This will start both the backend server (port 5000) and frontend development server (port 3000)

## Default Credentials

### Admin User
- **Username**: admin
- **Password**: admin123

### Operator User
- **Username**: operator
- **Password**: operator123

## Usage

### For Admin Users
1. **Dashboard**: View overall business metrics, low stock alerts, and recent activity
2. **Inventory Management**: Add new products, update stock levels, manage suppliers
3. **Sales**: View all sales transactions and generate reports
4. **Reports**: Access comprehensive business analytics and reports
5. **User Management**: Create and manage operator accounts

### For Operator Users
1. **Dashboard**: View available inventory and today's sales summary
2. **Sales**: Process customer sales with intuitive cart interface
3. **Reports**: View daily sales and basic inventory status

## Project Structure

```
inventory-management-system/
├── server/                 # Backend Node.js application
│   ├── database/          # Database setup and schemas
│   ├── middleware/        # Authentication middleware
│   ├── routes/           # API routes
│   ├── index.js          # Main server file
│   └── package.json      # Backend dependencies
├── client/               # React frontend application
│   ├── public/           # Static files
│   ├── src/              # React source code
│   │   ├── components/   # React components
│   │   └── contexts/     # React contexts
│   ├── package.json      # Frontend dependencies
│   └── tailwind.config.js
└── README.md            # This file
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/users` - Create user (admin only)
- `GET /api/auth/users` - Get all users (admin only)

### Inventory
- `GET /api/inventory` - Get all products
- `GET /api/inventory/:id` - Get single product
- `POST /api/inventory` - Add product (admin only)
- `PUT /api/inventory/:id` - Update product (admin only)
- `DELETE /api/inventory/:id` - Delete product (admin only)
- `POST /api/inventory/:id/add-stock` - Add stock (admin only)

### Sales
- `POST /api/sales` - Create sale
- `GET /api/sales` - Get sales (with date filtering)
- `GET /api/sales/:saleId` - Get sale details
- `GET /api/sales/receipts/all` - Get all receipts

### Reports
- `GET /api/reports/daily-sales` - Daily sales report
- `GET /api/reports/sales-range` - Sales for date range
- `GET /api/reports/inventory-status` - Inventory status
- `GET /api/reports/product-performance` - Product performance
- `GET /api/reports/monthly-trend` - Monthly sales trend

### Dashboard
- `GET /api/dashboard/admin` - Admin dashboard data
- `GET /api/dashboard/operator` - Operator dashboard data
- `GET /api/dashboard/quick-stats` - Quick statistics

## Database Schema

### Tables
- **users**: User authentication and roles
- **products**: Product inventory and details
- **sales**: Sales transactions
- **receipts**: Receipt information

## Features in Detail

### Inventory Management
- Product categorization (Seeds/Fertilizers)
- Stock quantity tracking with multiple units (kg, packet, bag)
- Purchase and selling price management
- Supplier information
- Low stock alerts (≤10 units)

### Sales Processing
- Real-time stock validation
- Cart-based sales interface
- Customer information capture
- Multiple payment modes (Cash, Card, UPI)
- Automatic receipt generation

### Reporting
- Daily sales summaries
- Date range reports
- Inventory status with valuation
- Product performance analysis
- Monthly trend analysis

### Security
- JWT-based authentication
- Role-based access control
- Password hashing with bcrypt
- Input validation and sanitization

## Development

### Adding New Features
1. Backend: Add routes in `server/routes/`
2. Frontend: Create components in `client/src/components/`
3. Database: Update schemas in `server/database/db.js`

### Testing
- Test with default credentials
- Verify stock updates on sales
- Check report generation
- Test role-based permissions

## Production Deployment

### Environment Variables
```env
PORT=5000
JWT_SECRET=your_secure_jwt_secret_here
DB_PATH=./database/inventory.db
```

### Security Considerations
- Change default passwords
- Use strong JWT secret
- Implement HTTPS in production
- Regular database backups
- Input validation on all endpoints

## Support

For issues and feature requests, please contact the development team.

## License

This project is licensed under the MIT License.
