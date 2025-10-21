# Identity Reconciliation Service

A Next.js API service for identity reconciliation that links customer contacts across multiple purchases.

## 🚀 Live Demo

**API Endpoint:** `https://bite-speed-identity-siddharth-choudhary.vercel.app/identify`

## 📝 API Documentation

### Postman usage

![alt text](image.png)

### Endpoint

```
POST /identify
```

### Request Body

```json
{
  "email": "string (optional)",
  "phoneNumber": "string (optional)"
}
```

At least one field must be provided.

### Response Format

```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["lorraine@hillvalley.edu", "mcfly@hillvalley.edu"],
    "phoneNumbers": ["123456"],
    "secondaryContactIds": [23]
  }
}
```
## 🔍 How It Works

1. **New Contact:** Creates a primary contact if no matches found
2. **Partial Match:** Creates secondary contact linking to existing primary
3. **Link Discovery:** When request links two separate primary contacts, the older one remains primary and newer becomes secondary
4. **Consolidation:** Returns all emails, phone numbers, and secondary IDs associated with the primary contact

## 📚 Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Database:** PostgreSQL (via Supabase)
- **Hosting:** Vercel
- **ORM/Client:** Supabase JS Client

## 👤 Author

Siddharth Choudhary - [GitHub Profile](https://github.com/IamSiddharthChoudhary)
---

Made with ❤️ for Bitespeed Backend Task