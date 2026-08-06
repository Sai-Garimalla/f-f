# Fire & Flavour Restaurant Billing Software -- Master Development Prompt

> **Project:** Fire & Flavour Restaurant Billing Software (Production
> Ready)

## Goal

Build a modern, production-ready Restaurant POS and Billing System for
**Fire & Flavour** with a premium flame-inspired UI and optimized UX.

## Branding & Theme

-   Restaurant Name: **Fire & Flavour**
-   Theme: Warm premium restaurant aesthetic.
-   Primary colors: Deep Red (#B71C1C), Flame Orange (#F57C00), Charcoal
    (#212121), White (#FFFFFF).
-   Use subtle gradients, rounded cards, soft shadows, responsive
    layouts, and touch-friendly controls.
-   Optimize for fast billing with minimal clicks.

## Tech Stack

### Frontend

-   HTML5
-   CSS3
-   Vanilla JavaScript
-   SheetJS (Excel import)

### Backend

-   Node.js
-   Express.js

### Database

-   TiDB Cloud (Free Tier)

### Printing

-   ESC/POS
-   TVS RP3230
-   80 mm Thermal Printer
-   Wi-Fi / USB / Bluetooth

## Modules

1.  Secure Login (Admin required)
2.  Dashboard
3.  Billing
4.  Recent Bills
5.  Upload/Edit Menu
6.  Settings
7.  Reports (future-ready)

## Authentication

-   Admin login using username/email + password.
-   Passwords hashed using bcrypt.
-   Remember Me.
-   Logout.
-   No automatic session timeout unless user logs out.
-   Future support for Staff role.

## Menu Management

Upload `.xlsx` with: - Item Code - Item Name - Category - Default Price

Uploading replaces the existing menu.

## Billing

-   Search by item code or name.
-   Editable prices (current bill only).
-   Quantity +/−.
-   Remove item.
-   Manual item entry.
-   Customer phone number (optional).

### Delivery

Toggle: - OFF (hidden everywhere) - ON: - ₹5 - ₹10 - ₹15 - ₹20 - Custom
amount

### Discount

Toggle: - OFF (hidden everywhere) - ON: - Percentage (%) - Fixed Amount
(₹)

Calculation: Subtotal + Delivery = Total Before Discount − Discount =
Grand Total

## Printing

Print directly to TVS RP3230.

Workflow: 1. Validate 2. Save to TiDB 3. Generate Token 4. Print
Customer Receipt 5. Auto-print Kitchen Order Ticket 6. Save to Recent
Bills

### Customer Receipt

Include: - Fire & Flavour - Address - Phone - Bill No - Token No -
Date/Time - Customer Phone (if entered) - Items - Qty - Price - Totals -
Delivery (if enabled) - Discount (if enabled) - Grand Total - Footer
message

### Kitchen Order Ticket (KOT)

Keep compact for 80 mm.

Include only: - Fire & Flavour - KITCHEN ORDER - Large Token Number -
Date - Time - Item Name - Quantity - Special Instructions (optional)

Do NOT print: - Prices - Totals - Discounts - Delivery - Payment
information

## Token Numbers

Auto-generate sequential tokens. Configurable: - Daily reset -
Continuous

## Recent Bills

Store every bill.

Columns: - Token - Bill No - Date - Time - Customer Phone - Grand Total

Actions: - View - Reprint Receipt - Reprint KOT - Reprint Both

## Dashboard

Cards: - Today's Sales - Today's Bills - Menu Count - Recent Bill

## Settings

-   Restaurant Name
-   Address
-   Phone
-   Footer
-   Customer Printer
-   Kitchen Printer
-   80 mm paper
-   Auto-print KOT
-   Auto-print Receipt
-   Token format

## Database

### users

id, full_name, username, email, password_hash, role, status, created_at

### menu

id, item_code, item_name, category, default_price

### bills

bill_id, bill_number, token_number, customer_phone, subtotal,
delivery_charge, discount_enabled, discount_type, discount_value,
discount_amount, grand_total, created_by, created_at

### bill_items

id, bill_id, item_code, item_name, quantity, unit_price, line_total,
is_manual

## UI/UX Requirements

-   Responsive desktop/mobile.
-   Fast search.
-   Keyboard-friendly.
-   Large touch targets.
-   Minimal clicks.
-   Billing and totals always visible.
-   KOT intentionally compact.
-   80 mm receipt optimized.
-   Professional animations.
-   Loading indicators.
-   Error handling.
-   Clean modular code.

## Final Deliverable

A production-ready restaurant POS for **Fire & Flavour** featuring: -
Secure admin authentication - Excel menu upload/edit - Fast billing -
Manual items - Delivery charges - Discounts - Customer phone - Token
numbers - Customer receipt - Compact Kitchen Order Ticket - Recent bills
with reprint - TiDB Cloud - Direct TVS RP3230 printing - Modern Fire &
Flavour themed UI/UX
