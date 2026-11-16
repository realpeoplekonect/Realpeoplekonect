# PEOKONECT — Social & Dating Platform

PEOKONECT is a Node.js, Express, MongoDB, Cloudinary and Socket.IO starter application. The frontend uses plain HTML, CSS and JavaScript.

## Included
- Public registration and login (18+ age gate)
- JWT authentication and hashed passwords
- Discover member profiles
- Photo posts with captions, likes and comments
- Connection requests and accept/decline workflow
- Real-time online/offline presence
- Real-time admin activity notifications
- Admin overview, member list and suspend/reactivate controls
- Cloudinary image upload support

## 1. Requirements
Install Node.js 18+ and MongoDB (local MongoDB or MongoDB Atlas).

## 2. Install
```bash
npm install
```

## 3. Configure environment
Copy `.env.example` to `.env` and enter your own values:
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: long random secret
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Cloudinary credentials
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: initial administrator login

The first start creates the admin account if it does not already exist. Keep the admin password private and change the example password before deployment.

## 4. Run
```bash
npm run dev
```
Open http://localhost:5000

## Admin
Open the site, use the email and password configured in `.env`, then select **Admin** in the navigation. Admin activity shows registration, successful login/logout, online/offline, posts and other recorded events. Online/offline reflects authenticated Socket.IO sessions. Offline users are not necessarily logged out; they may simply have closed the app or lost connectivity.

## Important production work
This is a functional starter, not a fully audited production dating service. Before public launch:
1. Configure HTTPS, production MongoDB backups and secure environment secrets.
2. Add email verification, password reset and account deletion.
3. Add blocking, reporting, moderation queues, image review and abuse escalation.
4. Add pagination, search filters and indexes for scale.
5. Restrict messaging to accepted connections and add message rate limits; the included message API is a starter.
6. Add consent, privacy policy, terms, retention rules and a clear safety process.
7. Consider a moderation/admin audit log and stronger admin MFA.
8. Test all flows with separate test accounts before launch.

Never commit `.env` or expose Cloudinary API secrets or the JWT secret in frontend code.
