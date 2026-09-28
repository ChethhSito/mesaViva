# Restaurant QR Ordering System

## 1. Project Overview

Build a modern restaurant management and ordering platform centered around QR-based table ordering, while also supporting traditional waiter-assisted service.

The system must connect:

- Customers
- Tables
- Waiters
- Kitchen
- Cashier
- Administration
- Finance

All actors must operate on the same shared data.

The system must prioritize:

- Simple customer experience
- Real-time synchronization
- Fast kitchen operations
- Clear order states
- Payment traceability
- Responsive design
- Accessibility
- Maintainable architecture
- Auditability
- Scalability to multiple restaurants

---

# 2. Main Product Concept

Each restaurant table has its own QR code.

Example concept:

```text
Restaurant
   ↓
Table QR
   ↓
Digital menu
   ↓
Cart
   ↓
Order
   ↓
Kitchen
   ↓
Waiter
   ↓
Customer receives food
   ↓
Customer requests bill
   ↓
Waiter / Cashier confirms payment
   ↓
Finance
   ↓
Table session closes
```

Customers should not need to create an account to order.

The QR identifies the restaurant and table automatically.

Example route:

```text
/r/[restaurant-slug]/table/[table-code]
```

Example:

```text
/r/la-cocina/table/T08
```

The customer should immediately see:

```text
Restaurant Name
Mesa 08

[ View Menu ]
```

---

# 3. Core Principle

The application MUST NOT treat each new item added by the customer as a completely independent bill.

Use the following hierarchy:

```text
Restaurant
    ↓
Table
    ↓
Table Session
    ↓
Orders
    ↓
Order Items
    ↓
Payment
```

A table session represents one customer service session.

Example:

```text
Mesa 08

Session #832
Customer: María

Order 1
- 2 Lomo Saltado
- 1 Inca Kola

Order 2
- 1 Cheesecake

---------------------

Total session:
S/ 85.00
```

Additional orders must be added to the current table session.

Do not create disconnected bills for additional orders.

---

# 4. Service Modes

The system supports two order origins.

```text
QR
WAITER
```

Store the origin.

Example:

```ts
order_source:
  | "QR"
  | "WAITER"
```

Both modes must use the same ordering system.

Do not implement separate architectures for QR orders and waiter orders.

---

# 5. QR Customer Flow

## Step 1 — Scan QR

Customer scans the QR located on the table.

The QR contains a URL identifying the restaurant and table.

The system determines:

```text
restaurant
table
active table session
```

---

## Step 2 — Digital Menu

Display categories.

Example:

```text
Entradas
Platos principales
Hamburguesas
Pastas
Bebidas
Postres
```

Each menu item should support:

```text
name
description
image
price
availability
category
allergens
preparation notes
```

Example card:

```text
Lomo Saltado

[IMAGE]

Carne de res, cebolla, tomate,
papas fritas y arroz.

S/ 25.00

[ Add ]
```

---

# 6. Product Detail

Selecting a product opens its detail.

Example:

```text
Lomo Saltado

S/ 25.00

Quantity

[-] 1 [+]

Special instructions

[ Sin cebolla                ]

[ Add to order ]
```

Possible future configuration:

```text
Cooking point
Sauces
Sides
Extras
Variants
```

---

# 7. Shopping Cart

The cart shows:

```text
2x Lomo Saltado      S/ 50
1x Inca Kola         S/ 8

---------------------------
Subtotal              S/ 58
```

Customer information:

```text
Name:
[ María ]

Table:
Mesa 08
```

The table should normally be detected automatically from the QR.

Do NOT require users to manually enter their table number when arriving through a valid table QR.

---

# 8. Confirming an Order

Before sending:

```text
Review your order

Mesa 08
María

2x Lomo Saltado
1x Inca Kola

Total: S/ 58

[ Confirm order ]
```

On confirmation:

1. Create or retrieve the active table session.
2. Create order.
3. Create order items.
4. Send order to kitchen.
5. Update waiter dashboard.
6. Update cashier dashboard.
7. Notify relevant real-time subscribers.

---

# 9. Order States

Use explicit states.

Recommended order lifecycle:

```text
NEW
CONFIRMED
SENT_TO_KITCHEN
PREPARING
READY
DELIVERED
IN_SERVICE
BILL_REQUESTED
PAYMENT_PENDING
PAID
CLOSED
CANCELLED
```

Avoid relying on arbitrary text strings.

Use enums or controlled state tables.

---

# 10. Order Item States

Individual products should also have states.

Example:

```text
PENDING
PREPARING
READY
DELIVERED
CANCELLED
```

This is important because different items may finish at different times.

Example:

```text
Mesa 08

Lomo Saltado     READY
Pizza            PREPARING
Inca Kola        READY
Cheesecake       PENDING
```

---

# 11. Kitchen Display System — KDS

Create a dedicated kitchen interface.

This interface is designed for:

- Large monitor
- TV
- Touch display
- Tablet

It should prioritize visibility over decorative design.

Suggested Kanban:

```text
NEW               PREPARING               READY

┌──────────┐      ┌──────────┐           ┌──────────┐
│ Mesa 08  │      │ Mesa 04  │           │ Mesa 12  │
│ 2 min    │      │ 8 min    │           │          │
│          │      │          │           │          │
│ 2 Lomo   │      │ 1 Pizza  │           │ 2 Chaufa │
│ 1 Soda   │      │          │           │          │
└──────────┘      └──────────┘           └──────────┘
```

Kitchen workers can:

```text
Accept
Start preparation
Mark item ready
Mark complete
```

Changes must synchronize in real time.

---

# 12. Kitchen UX Rules

Kitchen interface MUST:

- Use large text.
- Have high visual contrast.
- Minimize clicks.
- Show table prominently.
- Show elapsed time prominently.
- Display special instructions.
- Allow item-level status updates.
- Avoid complex animations.
- Avoid unnecessary navigation.
- Be usable on a TV or touch display.

Orders waiting too long can progressively receive increased visual emphasis.

Do not rely only on color to communicate status.

Always include text/icon indicators.

---

# 13. Waiter Dashboard

Waiters need a table-oriented interface.

Example:

```text
Mesa 01    AVAILABLE
Mesa 02    IN SERVICE
Mesa 03    ORDER READY
Mesa 04    BILL REQUESTED
Mesa 05    PAYMENT PENDING
Mesa 06    AVAILABLE
```

Waiter actions:

```text
Open table
Create order
Add products
Edit allowed items
View active orders
Deliver order
Transfer table
Request payment
Register payment
Close table
```

---

# 14. Traditional Service

Customers who do not want to use the QR must still be supported.

The waiter can select:

```text
Mesa 05

[ New order ]
```

Then use the same menu interface.

Example:

```text
Customer does not use QR
        ↓
Waiter selects table
        ↓
Waiter creates order
        ↓
order_source = WAITER
        ↓
Kitchen receives the same order
```

This must not generate a separate workflow.

---

# 15. Adding More Products During Service

While the session is open, customers can order additional items.

Example:

Initial order:

```text
2 Lomo Saltado
1 Inca Kola
```

Later:

```text
1 Cheesecake
```

The new order should:

1. Be associated with the existing table session.
2. Appear in kitchen.
3. Update waiter information.
4. Update cashier total.
5. Update customer total.

The table account becomes:

```text
Mesa 08

2 Lomo Saltado       S/ 50
1 Inca Kola          S/ 8
1 Cheesecake         S/ 12

---------------------------
Total                S/ 70
```

Do NOT generate multiple independent bills.

---

# 16. Request Bill

Customer interface must contain:

```text
[ Request bill ]
```

Before sending, request confirmation.

```text
Would you like to request the bill?

Total:
S/ 70.00

[ Cancel ]
[ Request bill ]
```

After confirmation:

```text
table_session.status = BILL_REQUESTED
```

Notify:

```text
Waiter
Cashier
```

Customer sees:

```text
Your bill has been requested.

A waiter will assist you shortly.
```

---

# 17. Payment

MVP payment methods:

```text
CASH
PHYSICAL_POS
YAPE
PLIN
OTHER
```

Online payment integration is NOT required for the first version.

Payment confirmation must be an explicit employee action.

Example:

```text
Mesa 08

Total:
S/ 70.00

Payment method:

○ Cash
● POS
○ Yape
○ Plin

[ Confirm payment ]
```

---

# 18. Mandatory Payment Confirmation

A table session MUST NOT close automatically just because the customer requested the bill.

The required flow is:

```text
BILL_REQUESTED
       ↓
PAYMENT_PENDING
       ↓
employee confirms payment
       ↓
PAID
       ↓
CLOSED
```

Store:

```text
payment method
amount
employee
timestamp
restaurant
table
table session
```

---

# 19. Finance

Once payment is confirmed, create a financial movement.

Example:

```text
SALE #000183

Date:
25/09/2026 21:43

Table:
08

Employee:
Carlos

Subtotal:
S/ 59.32

Tax:
S/ 10.68

Total:
S/ 70.00

Payment:
POS

Status:
PAID
```

Finance dashboard should support:

```text
Daily sales
Weekly sales
Monthly sales
Sales by payment method
Sales by product
Sales by category
Sales by waiter
Average ticket
Orders per table
Peak hours
```

---

# 20. Reports

Future report options:

```text
Export Excel
Export CSV
Export PDF
Daily report
Monthly report
Sales summary
```

Do not use generated files as the primary communication between kitchen, cashier and finance.

The database must be the single source of truth.

Files are only exports.

---

# 21. Recommended Roles

Initial roles:

```text
ADMIN
WAITER
KITCHEN
CASHIER
FINANCE
MANAGER
```

Possible future roles:

```text
OWNER
SUPERVISOR
HOST
DELIVERY
```

---

# 22. Permissions

Implement role-based access control.

Examples:

## Customer

Can:

```text
View menu
Create order
Add order
View order status
Request bill
```

Cannot:

```text
Change prices
Confirm payments
Cancel completed orders
Access dashboards
```

---

## Kitchen

Can:

```text
View kitchen orders
Update preparation states
View special instructions
```

Cannot:

```text
Confirm payment
Change product prices
View financial reports
```

---

## Waiter

Can:

```text
Manage assigned tables
Create orders
Add products
Deliver orders
Register payment if permitted
```

---

## Cashier

Can:

```text
View open accounts
Receive payment requests
Confirm payments
Review payment history
```

---

## Finance

Can:

```text
View sales
View financial movements
Generate reports
Export data
```

---

## Admin

Can manage:

```text
Restaurant
Users
Roles
Tables
Menu
Categories
Products
Prices
Settings
Permissions
```

---

# 23. Recommended Technology Stack

## Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
```

Use the current stable versions available in the project environment.

Prefer Next.js App Router.

---

# 24. Backend

Initial recommendation:

```text
Next.js server functionality
+
Supabase
```

Do not introduce microservices in the MVP.

Keep the architecture modular but monolithic.

Potential modules:

```text
auth
restaurants
tables
menu
orders
kitchen
payments
finance
reports
users
```

---

# 25. Database

Use:

```text
PostgreSQL
```

Recommended provider:

```text
Supabase
```

---

# 26. Authentication

Use:

```text
Supabase Auth
```

Authentication is required for employees.

Customers ordering through QR should NOT need an account.

Use secure session/table identifiers instead.

---

# 27. Real-Time System

Use:

```text
Supabase Realtime
```

Real-time events are required for:

```text
new order
order update
item status
kitchen status
bill requested
payment confirmation
table status
product availability
```

The UI should update without requiring manual refresh.

---

# 28. Storage

Use:

```text
Supabase Storage
```

For:

```text
Product images
Restaurant logos
Optional receipts
Optional generated reports
```

---

# 29. State Management

Preferred client-side state:

```text
Zustand
```

Use it primarily for local UI/client state.

Do not duplicate the entire server database inside global client state.

---

# 30. Server State

Preferred:

```text
TanStack Query
```

Use when it provides value for:

```text
fetching
cache
mutations
optimistic UI
revalidation
```

Do not introduce unnecessary abstractions if Next.js server-side data loading is enough.

---

# 31. Deployment

Recommended:

```text
Frontend / application:
Vercel

Database / Auth / Storage / Realtime:
Supabase
```

---

# 32. Initial Database Model

Suggested entities:

```text
restaurants
restaurant_settings

users
roles
user_roles

tables
table_sessions

categories
products
product_images
product_variants

orders
order_items
order_status_history

payments

financial_movements

audit_logs
```

---

# 33. Restaurant

Possible fields:

```text
id
name
slug
logo_url
address
phone
currency
timezone
status
created_at
updated_at
```

---

# 34. Tables

Possible fields:

```text
id
restaurant_id
name
code
capacity
qr_token
status
created_at
updated_at
```

Example:

```text
name = "Mesa 08"
code = "T08"
```

---

# 35. Table Session

Possible fields:

```text
id
restaurant_id
table_id
customer_name
status
opened_at
closed_at
opened_by
closed_by
```

Recommended states:

```text
OPEN
IN_SERVICE
BILL_REQUESTED
PAYMENT_PENDING
PAID
CLOSED
CANCELLED
```

---

# 36. Product

Possible fields:

```text
id
restaurant_id
category_id
name
description
price
image_url
available
active
created_at
updated_at
```

---

# 37. Orders

Possible fields:

```text
id
restaurant_id
table_session_id
order_number
source
status
created_by
created_at
updated_at
```

---

# 38. Order Items

Possible fields:

```text
id
order_id
product_id
product_name_snapshot
unit_price
quantity
notes
status
created_at
updated_at
```

Store product name and price snapshots.

Historical orders must NOT change when menu prices change later.

---

# 39. Payments

Possible fields:

```text
id
restaurant_id
table_session_id
amount
method
status
confirmed_by
confirmed_at
created_at
```

---

# 40. Financial Movement

Possible fields:

```text
id
restaurant_id
payment_id
type
amount
description
created_at
```

Possible types:

```text
SALE
REFUND
ADJUSTMENT
```

---

# 41. Audit Logs

Any sensitive action should be auditable.

Store events such as:

```text
PRODUCT_PRICE_CHANGED
ORDER_CANCELLED
ORDER_ITEM_CANCELLED
PAYMENT_CONFIRMED
PAYMENT_REVERSED
TABLE_CLOSED
USER_PERMISSION_CHANGED
```

Possible fields:

```text
id
restaurant_id
actor_user_id
event_type
entity_type
entity_id
metadata
created_at
```

---

# 42. Multi-Restaurant Architecture

Design the database with future SaaS usage in mind.

Most business entities should include:

```text
restaurant_id
```

Never expose records belonging to another restaurant.

Example:

```text
Restaurant A
├── tables
├── employees
├── products
├── orders
└── payments

Restaurant B
├── tables
├── employees
├── products
├── orders
└── payments
```

---

# 43. Security

Use database-level security where appropriate.

For Supabase:

```text
Row Level Security
```

All employee operations must verify:

```text
authenticated user
restaurant membership
role
permission
```

Never rely solely on hidden frontend buttons for authorization.

Authorization must be enforced server-side/database-side.

---

# 44. QR Security

Do not encode sequential database IDs directly if avoidable.

Avoid:

```text
/table/1
/table/2
/table/3
```

Prefer opaque table identifiers or tokens.

Example:

```text
/r/ceviche-house/t/H7K3P2
```

The system should validate:

```text
restaurant exists
table exists
table enabled
QR token valid
```

---

# 45. Product Availability

Kitchen or authorized employees can mark:

```text
AVAILABLE
SOLD_OUT
```

Changes should appear immediately in the customer's menu.

Example:

```text
Cheesecake

AGOTADO
```

Customer must not be able to order unavailable products.

Availability must also be validated server-side when confirming an order.

---

# 46. Inventory — Future Phase

Future entities:

```text
ingredients
inventory_items
recipes
inventory_movements
suppliers
purchases
```

Example:

```text
Lomo Saltado

requires:

200g beef
150g potato
100g rice
50g onion
```

Confirmed orders can later generate inventory movements.

Do not implement this before the core ordering workflow works reliably.

---

# 47. Additional Future Features

Possible future modules:

```text
Reservations
Promotions
Discounts
Loyalty
Customers
Delivery
Inventory
Purchases
Suppliers
Electronic invoicing
SUNAT integration
Online payments
Multiple branches
Kitchen printers
Notifications
Analytics
AI recommendations
```

---

# 48. MVP Scope

The first version should contain only:

```text
Restaurant configuration
Tables
QR generation
Digital menu
Categories
Products
Cart
Order creation
Additional orders
Kitchen dashboard
Waiter dashboard
Bill request
Payment registration
Payment confirmation
Finance records
Table closure
Basic sales dashboard
```

---

# 49. Phase 2

After the MVP is stable:

```text
Advanced reports
Inventory
Sold-out automation
Audit dashboard
Product variants
Discounts
Split bills
Transfer tables
Merge tables
Thermal printing
```

---

# 50. Phase 3

Future:

```text
Online payments
SUNAT
Electronic invoicing
Multi-branch
Reservations
Customer accounts
Loyalty
Promotions
Advanced analytics
AI insights
```

---

# 51. UX Philosophy

The application should feel like a modern restaurant product rather than an administrative ERP.

Customer interface:

```text
visual
simple
mobile-first
food-focused
fast
minimal
premium
```

Employee dashboards:

```text
functional
fast
clear
high-density when needed
low cognitive load
```

Do not blindly use the same visual layout for customers, kitchen, finance and administration.

Each interface has a different purpose.

---

# 52. Design Direction

Visual direction:

```text
Modern restaurant
Editorial menu design
Warm
Premium
Minimal
Highly photographic
Soft depth
Strong typography
Subtle motion
```

Avoid generic SaaS appearance on the customer menu.

Avoid excessive:

```text
blue gradients
glassmorphism everywhere
floating cards everywhere
purple AI aesthetic
random gradients
excessive rounded rectangles
```

The menu must make food the visual protagonist.

---

# 53. Customer Menu Visual Hierarchy

Prioritize:

```text
1. Food photography
2. Product name
3. Price
4. Description
5. CTA
```

Recommended card structure:

```text
┌─────────────────────────────┐
│                             │
│         FOOD IMAGE          │
│                             │
├─────────────────────────────┤
│ Lomo Saltado                │
│ Traditional Peruvian dish   │
│                             │
│ S/ 25                 [+]   │
└─────────────────────────────┘
```

---

# 54. Mobile First

The customer application must be designed for phones first.

Important breakpoints:

```text
mobile
tablet
desktop
large kitchen display
```

Do not design desktop first and simply shrink everything.

---

# 55. Motion Design

Use motion purposefully.

Good motion:

```text
cart item added
order confirmed
button feedback
page transitions
category transition
bottom sheet
status progression
success state
```

Avoid excessive decorative animation.

Motion should communicate state or improve perceived quality.

Use:

```text
CSS transitions
Framer Motion / Motion
```

only where useful.

---

# 56. Motion Rules

Recommended animation duration:

```text
micro interaction:
120–220ms

component transition:
180–320ms

page/large transition:
250–450ms
```

Prefer:

```text
opacity
transform
scale
clip
```

Avoid animating expensive layout properties unnecessarily.

Respect:

```css
prefers-reduced-motion
```

---

# 57. Customer Navigation

Suggested mobile navigation:

```text
Home / Menu
Search
Orders
Cart
```

Avoid exposing administrative navigation.

---

# 58. Cart UX

On mobile, use a persistent contextual cart action.

Example:

```text
┌───────────────────────────────┐
│ 3 products     S/ 58          │
│                  View order → │
└───────────────────────────────┘
```

It may appear as a bottom floating/sticky action.

Do not cover critical page content.

---

# 59. Search

Allow customers to search:

```text
product
category
keywords
```

Possible future:

```text
vegetarian
spicy
gluten-free
popular
new
```

---

# 60. Empty and Loading States

Never leave blank pages.

Use explicit states.

Examples:

```text
Loading menu...
No products in this category.
Your cart is empty.
There are no active orders.
No tables currently request payment.
```

Use skeletons when useful.

---

# 61. Error Handling

Provide understandable errors.

Bad:

```text
Error 500
```

Better:

```text
We couldn't send your order.

Your cart is still saved.

[ Try again ]
```

Do not clear the cart when order creation fails.

---

# 62. Offline / Connection Problems

Restaurant Wi-Fi can be unreliable.

Design for temporary connectivity issues.

At minimum:

```text
detect connection loss
show offline state
avoid duplicate order submission
preserve local cart
retry safe reads
```

Mutations must use idempotency or other protections where necessary.

Never create duplicate orders because a user tapped twice.

---

# 63. Accessibility

Support:

```text
keyboard navigation
screen readers
sufficient contrast
large touch targets
visible focus states
semantic HTML
reduced motion
```

Minimum touch target should be comfortable for mobile restaurant usage.

Do not use color as the only signal.

---

# 64. Design Resources and Agent Skills

The AI developing this application may use external design skills and references.

Recommended resource categories:

```text
Frontend design skills
React best practices
Next.js best practices
shadcn/ui skills
Supabase/Postgres skills
Accessibility
Web app testing
Security audits
Motion design
Design-first UI prompting
```

Useful resource collections:

```text
AgenticSkills
MengTo / Skills
MotionSites
```

Use these resources as:

```text
design inspiration
workflow guidance
implementation guidance
quality checks
```

Do NOT blindly copy an entire external design.

Extract:

```text
layout logic
typography
spacing
animation principles
interaction patterns
visual hierarchy
```

and adapt them to this restaurant product.

---

# 65. Recommended Agent Skill Strategy

Do not install dozens of skills at once.

Prefer a small curated toolset.

Recommended starting set:

```text
1. frontend-design
2. react-best-practices
3. design-first-ui-prompting
4. shadcn/ui
5. supabase-postgres
6. webapp-testing
7. accessibility / web-design-guidelines
```

Add specialized skills only when the project reaches that phase.

---

# 66. Design Reference Workflow

When using inspiration:

```text
Reference
    ↓
Identify visual principles
    ↓
Extract layout
    ↓
Extract typography
    ↓
Extract spacing
    ↓
Extract interaction
    ↓
Adapt to restaurant
    ↓
Implement reusable components
```

Do not request:

```text
"make it like this website"
```

Instead describe what should be reused.

Example:

```text
Use the reference only for:

- large editorial typography
- edge-to-edge food photography
- 24px card radius
- compact product metadata
- subtle image scale on hover
- sticky mobile cart action

Do not reproduce branding or copy.
```

---

# 67. AI Development Rules

When an AI coding agent works on this project:

1. Read this file first.
2. Understand existing architecture before creating new modules.
3. Reuse existing components.
4. Do not duplicate business logic.
5. Do not introduce dependencies without a clear benefit.
6. Keep TypeScript strict.
7. Avoid `any` unless absolutely necessary.
8. Validate user input.
9. Validate authorization server-side.
10. Handle loading, error and empty states.
11. Preserve mobile responsiveness.
12. Run lint/type checks after significant changes.
13. Do not modify unrelated code.
14. Use small reusable components.
15. Keep business logic outside presentation components.
16. Document non-obvious decisions.
17. Protect against duplicate orders.
18. Never trust client-calculated prices.
19. Recalculate totals server-side.
20. Never expose service-role credentials to the browser.

---

# 68. Price Security

The frontend may display:

```text
product price
quantity
estimated total
```

But the server MUST calculate the authoritative order total.

Never accept this as trusted input:

```json
{
  "product": "Lomo Saltado",
  "price": 1
}
```

Instead receive:

```json
{
  "productId": "...",
  "quantity": 2
}
```

Then retrieve the actual price server-side.

---

# 69. Data Integrity

Use database transactions or equivalent atomic operations when appropriate.

Important operations include:

```text
confirm order
confirm payment
close table
cancel paid transaction
inventory deduction
```

---

# 70. UI Component Strategy

Create reusable primitives.

Examples:

```text
ProductCard
ProductGrid
CategoryTabs
QuantitySelector
CartDrawer
CartItem
TableCard
OrderCard
KitchenTicket
StatusBadge
PaymentDialog
MetricCard
EmptyState
LoadingState
ConfirmDialog
```

Do not create giant page components containing all logic.

---

# 71. Suggested Application Structure

Example:

```text
src/
├── app/
│   ├── r/
│   │   └── [restaurant]/
│   │       └── table/
│   │           └── [table]/
│   │
│   ├── dashboard/
│   │   ├── kitchen/
│   │   ├── waiter/
│   │   ├── cashier/
│   │   ├── finance/
│   │   └── admin/
│
├── components/
│   ├── menu/
│   ├── cart/
│   ├── kitchen/
│   ├── tables/
│   ├── orders/
│   ├── payments/
│   └── ui/
│
├── features/
│   ├── orders/
│   ├── tables/
│   ├── menu/
│   ├── payments/
│   └── finance/
│
├── lib/
│   ├── supabase/
│   ├── auth/
│   ├── validation/
│   └── utils/
│
├── types/
│
└── hooks/
```

Adapt this structure to the actual framework conventions.

Do not force this exact folder structure if the project already has a coherent architecture.

---

# 72. Definition of Done

A feature is not complete merely because it visually renders.

A feature is complete when:

```text
UI works
mobile works
loading handled
errors handled
authorization verified
database operation verified
real-time behavior verified where required
type checking passes
no obvious duplicate logic
accessibility considered
```

---

# 73. First Implementation Milestone

Implement this exact vertical slice first:

```text
Create restaurant
        ↓
Create tables
        ↓
Generate QR
        ↓
Open QR
        ↓
View menu
        ↓
Add products
        ↓
Confirm order
        ↓
Kitchen receives order
        ↓
Kitchen marks ready
        ↓
Waiter sees ready order
        ↓
Order delivered
        ↓
Customer requests bill
        ↓
Waiter confirms payment
        ↓
Finance receives sale
        ↓
Table closes
```

Do NOT build advanced analytics or inventory until this flow works end-to-end.

---

# 74. Product Goal

The final product should make this experience possible:

```text
Customer scans QR.
Customer orders in less than a minute.
Kitchen immediately sees the order.
Waiter knows when it is ready.
Customer can add more products at any time.
The entire table remains under one account.
Customer requests the bill.
Employee confirms payment.
Finance receives the transaction automatically.
The table becomes available again.
```

Every architectural and UX decision should support this flow.

---

# 75. Guiding Principle

When choosing between:

```text
more features
```

and:

```text
a reliable restaurant service flow
```

always prioritize the reliable service flow.

The system should feel simple to the customer even if the underlying implementation is sophisticated.