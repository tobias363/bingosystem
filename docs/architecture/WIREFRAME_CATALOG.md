# Spillorama Wireframe Catalog

**Version**: 2026-04-23  
**Purpose**: Complete reference documentation of all 15 legacy Spillorama bingo system wireframes  
**Scope**: Admin panel and Agent/Bingovert portal  
**Total PDFs**: 15 (245+ pages)  
**Date Range**: 2023-03 to 2025-01  

---

## Table of Contents

1. [PDF 1: Admin V1.0 - Game 1 (24.3.2023)](#pdf-1-admin-v10---game-1)
2. [PDF 2: Admin V1.0 (5.10.2023)](#pdf-2-admin-v10)
3. [PDF 3: Admin V1.0 - Mystery Game](#pdf-3-admin-v10---mystery-game)
4. [PDF 4: Spillorama Admin V1.0](#pdf-4-spillorama-admin-v10)
5. [PDF 5: Game 2 & 3 Frontend](#pdf-5-game-2--3-frontend)
6. [PDF 6: Game 5 Admin](#pdf-6-game-5-admin)
7. [PDF 7: Bot Report](#pdf-7-bot-report)
8. [PDF 8: Admin CR](#pdf-8-admin-cr)
9. [PDF 9: Frontend CR](#pdf-9-frontend-cr)
10. [PDF 10: Deposit & Withdraw](#pdf-10-deposit--withdraw)
11. [PDF 11: Agent V2.0](#pdf-11-agent-v20)
12. [PDF 12: Admin Import Player](#pdf-12-admin-import-player)
13. [PDF 13: Agent Daily Balance & Settlement](#pdf-13-agent-daily-balance--settlement)
14. [PDF 14: Screen Saver Setting](#pdf-14-screen-saver-setting)
15. [PDF 15: Agent V1.0 Latest](#pdf-15-agent-v10-latest)

---

## PDF 1: Admin V1.0 - Game 1

**Date**: 24.3.2023  
**Pages**: 90+  
**Scope**: Admin panel for Game 1 (75-ball bingo) management  

### Purpose
Initial admin interface for configuring and managing Game 1 bingo games with ticket types, patterns, and settlement workflows.

### Key Screens

#### 1.1 Add Physical Ticket Dialog
**Purpose**: Register physical paper tickets into the system with ID ranges and game association

**Layout**: Modal dialog overlay

**Fields**:
- Sub Game Name (dropdown) - selects which game to add tickets for
- Start Time (time input)
- End Time (time input)
- Notification Start Time (text input)
- Total Records to display Single Ball (numeric)

**Tables**:
- Scanned Tickets table (hidden initially, appears after submission)
  - Columns: Ticket Type, Initial ID, Final ID, Action (delete icon)
  - Contains scan results with calculated ID ranges

**Buttons**:
- Submit (primary action)
- Cancel

**Business Rules**:
- Physical tickets must have start/end time boundaries
- Ticket IDs must be continuous ranges
- One sub-game per physical ticket batch
- Scanned ticket records displayable in below table

#### 1.2 View Sub Game Details
**Purpose**: Display configured game details for verification before scheduling

**Layout**: Form display with nested tables

**Fields**:
- Sub Game Name
- Start Time / End Time (time displays)
- Notification Start Time
- Total Records to display Single Ball
- Ticket Color / Type / Price table with rows for Small Yellow, Large Yellow, etc.
- Game Name: Bud-Pattern Price table showing game-specific pricing per pattern

**Tables**:
- Pattern pricing grid showing ticket colors, row patterns (Row 1-4, Full House), and price per pattern
- User Type / Price matrix by player type and pattern

**Navigation**:
- Back button to previous screen
- Cancel button

**Business Rules**:
- All prices displayed per ticket color
- Patterns available per game type (5 patterns minimum)
- User types may have different prices

#### 1.3 Scheduled Games List
**Purpose**: Display all scheduled games for admin review and management

**Layout**: Main grid view with filter/search

**Fields**:
- Game list table with columns:
  - Game Name
  - Start Date & Time
  - End Date & Time
  - Hall Name
  - Status (Active/Inactive)
  - Type selector (dropdown: Physical Ticket, Online, Unique ID)
  - Actions (edit, delete icons)

**Pagination**: Previous/Next navigation

**Buttons**:
- Add Game button
- Schedule Game button
- Cancel Scheduled Games button

**Business Rules**:
- Games can be filtered by type
- Multiple games per day supported
- Status indicates if game is currently active
- Hall assignment determines location/agent visibility

---

## PDF 2: Admin V1.0

**Date**: 5.10.2023  
**Pages**: 50+  
**Scope**: Admin V1.0 core features - Game 1, 2, 3, 4 management

### Purpose
Comprehensive admin interface for multi-game management with player approval workflow, hall creation, and role-based access.

### Key Screens

#### 2.1 Player Management - Approved Players
**Purpose**: View and manage approved players in the system

**Layout**: Grid view with side navigation and detail panel

**Fields**:
- Side navigation: Player Management, Hall Creation, Game Management, Reports, Settings
- Main grid columns:
  - Player Name
  - Personal Info (expandable)
  - Phone Number
  - Status (Active/Inactive)
  - Action buttons (edit, delete, view details)

**Detail Panel**:
- Full player information display
- Phone contact handling options
- Approval status indicator

**Pagination**: Multiple pages with Previous/Next controls

**Business Rules**:
- Only approved players visible in this view
- Phone numbers protected/masked in grid
- Personal info hidden until expanded
- Admin can modify player status

#### 2.2 Hall Creation
**Purpose**: Register new bingo hall locations with configuration

**Layout**: Form with nested details section

**Fields**:
- Hall Name (text input)
- Hall Registry / ID (text input)
- IP Address (text input)
- Location Details (text area)
- Agent Assignment (dropdown selector)
- Status (Active/Inactive toggle)

**Sub-Section - Hall Details**:
- Hall capabilities (Game types offered)
- Opening hours
- Capacity
- Available ticket types

**Buttons**:
- Create Hall
- Cancel

**Business Rules**:
- Each hall must have unique IP address
- IP address links to TV screen display for game results
- Agent assignment determines access scope
- Hall capabilities restrict which games can be played there

#### 2.3 Game Management
**Purpose**: Configure game schedules and handle agent readiness

**Layout**: Calendar view with game list and popup dialogs

**Components**:
- Monthly calendar showing scheduled games
- Game name and time display on dates
- Agent readiness notification system

**Popup - Agent Readiness Confirmation**:
- Displays when agent needs to confirm game start
- Shows game details (name, start time, players registered)
- Agent must confirm before game begins
- System auto-marks game as started after confirmation

**Business Rules**:
- Manual schedule handling by admin
- Agent must confirm readiness before game start
- System prevents premature game start
- Games can have multiple scheduled times per day

---

## PDF 3: Admin V1.0 - Mystery Game

**Date**: 2023  
**Pages**: 100+  
**Scope**: Mystery game type admin configuration with spinning wheel mechanics

### Purpose
Admin interface for configuring and managing Mystery Game (spinning wheel bingo variant) with multiplier patterns and prize pools.

### Key Screens

#### 3.1 View Sub Game Details (Mystery Game)
**Purpose**: Configure Mystery Game sub-game with wheel mechanics

**Layout**: Form with pattern grid and wheel visualization

**Fields**:
- Sub Game Name
- Start/End Time
- Game Type selector (dropdown for different game variants)
- Pattern configuration section

**Wheel Configuration**:
- Spinning wheel preview (visual representation)
- Prize multiplier indicators
- Pattern segments (highlighted in different colors)

**Pattern Grid**:
- Columns: Pattern Name, Prize Base Amount, Winning Pattern Overlay
- Rows: Mystery Game patterns with different multiplier values
- Formula: Prize = Base × Multiplier (e.g., 100kr × 2 = 200kr)

**Buttons**:
- Save Configuration
- Test Wheel
- Cancel

**Business Rules**:
- Wheel segments must sum to 100% probability
- Multipliers can range from 1x to 5x base prize
- Each pattern has independent base prize
- Real-time wheel simulation possible

---

## PDF 4: Spillorama Admin V1.0

**Date**: 2023  
**Pages**: 80+  
**Scope**: General admin features covering multiple game types

### Purpose
Comprehensive admin dashboard with game scheduling, player management, and settlement views.

### Key Screens

#### 4.1 Admin Dashboard
**Purpose**: Central hub for admin activities and system status

**Layout**: Dashboard with multiple widget sections

**Widgets**:
1. **Pending Games** - Shows upcoming scheduled games
2. **Active Players** - Count of currently logged-in players
3. **Hall Status** - Status of all configured halls
4. **Recent Transactions** - Last N transactions for audit
5. **System Health** - Uptime and error status

**Navigation Menu**:
- Players Management
- Hall Creation
- Game Management
- Reports
- Settlement
- User Management

**Business Rules**:
- Real-time data refresh every 30 seconds
- Critical alerts highlighted
- Admin cannot modify active game state

---

## PDF 5: Game 2 & 3 Frontend

**Date**: 2024  
**Pages**: 60+  
**Scope**: Player-facing UI for Game 2 (72-ball) and Game 3 (pick-any) games

### Purpose
Frontend interfaces for player signup, game selection, and profile management for Game 2 and Game 3 variants.

### Key Screens

#### 5.1 Login Screen
**Purpose**: Player authentication

**Layout**: Centered form

**Fields**:
- Username / Player ID (text input)
- Password (password input)
- Remember Me (checkbox)

**Links**:
- Forgot Password
- Sign Up for New Account

**Buttons**:
- Login (primary)
- Cancel

**Business Rules**:
- Session timeout after 30 minutes of inactivity
- Failed login locked after 5 attempts
- Player ID can be email or username

#### 5.2 Game Landing
**Purpose**: Player dashboard showing available games and participation options

**Layout**: Dashboard with game cards

**Cards**:
- Game 2 (72-ball) - Shows next game time, entry fee, player count
- Game 3 (pick-any) - Shows current game status, rules explanation
- Mystery Game (if available) - Wheel preview

**Action Buttons**:
- Join Game 2
- Join Game 3
- View Game History
- View Account Settings

**Business Rules**:
- Only shows games available at player's hall
- Games in progress marked as "Playing Now"
- Future games show countdown timer

#### 5.3 Game Signup
**Purpose**: Player selects ticket and confirms entry fee

**Layout**: Ticket selection grid

**Components**:
- Ticket Type selector (Small Yellow, Large Yellow, etc.)
- Quantity selector
- Total cost calculation
- Entry fee breakdown

**Fee Display**:
- Base ticket price
- Hall fee
- System fee
- Total amount due

**Buttons**:
- Confirm Entry
- Cancel

**Business Rules**:
- Multiple tickets per game allowed
- Cost calculated immediately
- No refunds after game starts
- Player balance must cover entry fee

#### 5.4 Profile Screen
**Purpose**: Player account settings and personal information

**Layout**: Form with expandable sections

**Sections**:
- Personal Information (name, DOB, email)
- Contact Details (phone, address)
- Account Settings (language, notifications)
- Account Balance Display
- Transaction History (recent)

**Fields**:
- Full Name
- Email Address
- Phone Number
- Preferred Language
- Notification Preferences

**Buttons**:
- Save Changes
- Change Password
- Logout

**Business Rules**:
- Players can only edit own profile
- Email used for password recovery
- Phone used for SMS notifications

---

## PDF 6: Game 5 Admin

**Date**: 23.11.2023  
**Pages**: 40+  
**Scope**: Admin configuration for Game 5 (SpinnGo with multipliers)

### Purpose
Admin interface for configuring SpinnGo game variant with spinning multiplier mechanics and pattern-based winnings.

### Key Screens

#### 6.1 Pattern Configuration
**Purpose**: Set up pattern multipliers and prize pools for SpinnGo

**Layout**: Grid-based configuration table

**Fields**:
- Pattern Name (e.g., "Row 1", "Row 2", "Full House")
- Base Prize Amount (numeric input)
- Multiplier Selector (dropdown: 1x, 2x, 3x, 4x, 5x)
- Final Prize Calculation (read-only: Base × Multiplier)

**Wheel Visualization**:
- Spinning wheel graphic showing multiplier segments
- Color-coded by multiplier value
- Probability display for each segment

**Tables**:
- Pattern Summary table showing all configured patterns with current settings
- Historical pattern data (optional)

**Buttons**:
- Save Configuration
- Test Spin (launches wheel simulator)
- Reset to Defaults
- Cancel

**Business Rules**:
- All multipliers must be positive numbers
- Base prizes set per pattern
- Final prize can exceed base (due to multiplier)
- Prize pool limits apply per hall/day

---

## PDF 7: Bot Report

**Date**: 31.01.2024  
**Pages**: 30+  
**Scope**: Reports module for bot activity tracking, player history, and hall analytics

### Purpose
Reporting interface for admins to monitor bot players, hall performance, and game-specific statistics.

### Key Screens

#### 7.1 Hall Specific Report
**Purpose**: Generate detailed report for a specific bingo hall

**Layout**: Filter bar + results table + export

**Filters**:
- Hall Name (dropdown selector)
- Date Range (From/To date pickers)
- Game Type (checkbox filter)
- Report Type (dropdown selector)

**Report Options**:
- Hall Account Report
- Player Report
- Game Report
- Settlement Report
- Bot Activity Report

**Results Table**:
- Columns depend on report type
- Example (Hall Account Report):
  - Date
  - Revenue (gross)
  - Winnings Paid Out
  - Net Revenue
  - Player Count
  - Game Count
  - Average Player Balance

**Pagination**: Previous/Next controls showing "Showing 1 to 10 of 100 entries"

**Export Options**:
- Download as PDF
- Download as CSV
- Print Report

**Business Rules**:
- Reports only show completed games
- Pending settlements excluded
- Hall managers can only see own hall
- System admins see all halls

#### 7.2 Player List with Unique IDs
**Purpose**: Display all players and their Unique ID assignments

**Layout**: Searchable grid

**Columns**:
- Player Name
- Player ID
- Unique ID (if assigned)
- Purchase Date
- Expiry Date
- Balance Amount
- Games Played
- Total Winnings
- Status (Active/Inactive)

**Search/Filter**:
- Search by Player Name
- Filter by Status
- Filter by Date Range

**Business Rules**:
- Unique IDs track physical ticket ownership
- Purchase date shows ticket activation
- Expiry dates limit ticket validity (typically 1 year)
- Balance shown in currency (NOK)

#### 7.3 Order Report
**Purpose**: Track all ticket orders placed through system

**Layout**: Filterable data table

**Columns**:
- Order ID
- Player Name
- Order Date & Time
- Ticket Type
- Quantity
- Total Amount
- Payment Status (Paid/Pending/Failed)
- Payment Type (Cash/Card/Online)

**Filters**:
- Date Range selector
- Status filter
- Payment Type filter

**Business Rules**:
- Orders track all ticket purchases
- Can include physical and online sales
- Payment status affects order completion
- Audit trail for all transactions

---

## PDF 8: Admin CR (Change Request 21.02.2024)

**Date**: 21.02.2024  
**Pages**: 40+  
**Scope**: Updated admin features including player import, hall creation updates, role management

### Purpose
Admin Change Request updates addressing player bulk import, enhanced hall configuration, and role-based permission system.

### Key Screens

#### 8.1 Player Import
**Purpose**: Bulk import players from external data source

**Layout**: Form with file upload and preview

**Fields**:
- Import File (file upload input)
- Import Type selector (dropdown: CSV, Excel, Database)
- Field Mapping (column matching interface)

**Preview Table**:
- Shows first 10 rows of imported data
- Columns from source file with preview values
- Validation status indicators (checkmark/error)

**Buttons**:
- Choose File
- Preview Import
- Import Players
- Cancel

**Business Rules**:
- CSV/Excel format supported
- Duplicate player detection (prevent re-import)
- Players marked as "pending approval" initially
- Import can be scheduled for off-peak hours

#### 8.2 Hall Creation (Enhanced)
**Purpose**: Create and configure new bingo hall with advanced options

**Layout**: Multi-step form

**Step 1 - Basic Information**:
- Hall Name (required)
- Location / City
- Address
- Contact Email
- Contact Phone

**Step 2 - System Configuration**:
- IP Address (for TV screen)
- Server Assignment (dropdown)
- Game Types Offered (checkboxes: Game 1, 2, 3, 4, 5, Mystery)
- Opening Hours (time ranges)

**Step 3 - Agent Assignment**:
- Primary Agent (dropdown selector)
- Backup Agents (multi-select)
- Role Permissions (checkboxes)

**Step 4 - Confirmation**:
- Review all settings
- Confirm button to create

**Business Rules**:
- Hall name must be unique
- At least one game type required
- At least one primary agent required
- IP address validates for connectivity

#### 8.3 Role Management
**Purpose**: Define and assign user roles with granular permissions

**Layout**: Role list + permission matrix

**Role List**:
- Built-in roles: Super Admin, Admin, Hall Manager, Agent, Viewer
- Custom role creation option

**Permission Matrix**:
- Rows: Feature areas (Player Management, Game Management, Reports, Settlement, etc.)
- Columns: Permission types (View, Create, Edit, Delete, Export)
- Checkboxes to grant/revoke permissions

**Role Details**:
- Role Name
- Description
- Member Count
- Last Modified Date
- Actions: Edit, Delete (if custom role)

**Business Rules**:
- Built-in roles cannot be deleted
- Custom roles can be created/modified/deleted
- Permission changes apply immediately to all users with role
- Audit trail of role changes maintained

#### 8.4 Close Days
**Purpose**: Define dates when games are not scheduled (holidays, maintenance)

**Layout**: Calendar view with date picker

**Components**:
- Calendar display
- Close dates highlighted
- Add Close Day dialog

**Add Close Day Fields**:
- Date selector (date picker)
- Reason (text input)
- Recurring (checkbox)
- If recurring:
  - Frequency (dropdown: Daily, Weekly, Monthly, Yearly)
  - End Date (date picker)

**Buttons**:
- Add Close Day
- Delete Close Day
- Save Changes

**Business Rules**:
- Games cannot be scheduled on close days
- Recurring close days repeat automatically
- Can be set per hall or globally
- Admin notification when conflicting games exist

---

## PDF 9: Frontend CR (2024)

**Date**: 2024  
**Pages**: 40+  
**Scope**: Player frontend updates with enhanced authentication and account management

### Purpose
Frontend Change Request updates for improved login experience and account settings interface.

### Key Screens

#### 9.1 Enhanced Login
**Purpose**: Improved authentication with support for multiple login methods

**Layout**: Centered form with method selector

**Methods**:
- Player ID + Password
- Email + Password
- Phone Number + PIN

**Fields**:
- Username/Email/Phone (dynamic label)
- Password/PIN (dynamic label)
- Remember Me (checkbox)
- Two-Factor Authentication option (if enabled)

**Links**:
- Forgot Password (email recovery)
- Sign Up
- Help

**Business Rules**:
- Session tokens expire after 8 hours
- Two-factor auth available for high-balance accounts
- Login attempts rate-limited (5 attempts / 15 minutes)

#### 9.2 Enhanced Settings/Profile
**Purpose**: Comprehensive account management interface

**Layout**: Tabbed interface

**Tabs**:

**Tab 1 - Personal Information**:
- Full Name
- Date of Birth
- Email Address
- Phone Number
- Address
- Edit button

**Tab 2 - Account Security**:
- Password Change button
- Two-Factor Authentication toggle
- Active Sessions list (device, login time, last activity)
- Logout All Sessions button

**Tab 3 - Game History**:
- Recent games table (last 50)
- Filter by game type
- Filter by date range
- View detailed game results

**Tab 4 - Preferences**:
- Language preference
- Email notifications toggle
- SMS notifications toggle
- Marketing communications toggle
- Responsible gaming settings

**Business Rules**:
- Players can only edit own profile
- Password must be changed every 90 days
- Email notifications require confirmation
- Profile changes logged in audit trail

---

## PDF 10: Deposit & Withdraw

**Date**: 18.03.2024  
**Pages**: 19  
**Scope**: Cash management flows for player deposits and withdrawals

### Purpose
Payment handling interfaces for players to add/remove funds via multiple payment methods.

### Key Screens

#### 10.1 Deposit Request - Pay in Hall
**Purpose**: Player requests to add funds at physical hall location

**Layout**: Form dialog

**Fields**:
- Amount to Deposit (numeric input)
- Payment Method selector (dropdown: Vipps, Card, Cash)
- Reference Note (optional text field)
- Confirmation checkbox (acknowledge terms)

**Display**:
- Current Balance (read-only)
- New Balance Preview (calculated display)

**Buttons**:
- Confirm Deposit
- Cancel

**Business Rules**:
- Minimum deposit: 100 NOK
- Maximum deposit per transaction: 50,000 NOK
- Hall agent must confirm receipt
- Funds available immediately after confirmation

#### 10.2 Deposit Request - Vipps/Card
**Purpose**: Player deposits via Vipps or credit card

**Layout**: Multi-step form

**Step 1 - Amount**:
- Amount selector (common amounts: 100, 250, 500, 1000, 2500)
- Custom amount option
- Promo code field (optional)

**Step 2 - Payment Method**:
- Vipps (phone number required)
- Credit Card (Visa/Mastercard)
- Apple Pay / Google Pay

**Step 3 - Confirmation**:
- Amount display
- Fee display (if applicable)
- Total due display
- Payment processing note

**Business Rules**:
- Card payments charged immediately
- Vipps payment waits for confirmation
- Processing fee: 0% (free)
- Payment confirmation via email/SMS

#### 10.3 Deposit History
**Purpose**: Track all deposit transactions for account

**Layout**: Data table with filters

**Columns**:
- Date & Time
- Amount
- Payment Method (Cash/Card/Vipps)
- Status (Completed/Pending/Failed)
- Balance After
- Confirmation ID

**Filters**:
- Date Range picker
- Status filter
- Method filter

**Pagination**: Previous/Next controls

**Business Rules**:
- History retained for 7 years
- Pending deposits can be cancelled
- Failed deposits can be retried
- Each deposit has unique confirmation ID

#### 10.4 Withdraw in Hall
**Purpose**: Player withdraws cash at hall location

**Layout**: Request form + confirmation popup

**Fields**:
- Withdraw Amount (numeric input)
- Current Balance (display)
- Available Balance (display, excluding locked funds)
- Reason (optional dropdown: "End of session", "Early withdrawal", "Other")

**Popup Confirmation**:
- Amount to withdraw
- Time estimate (instant)
- Hall location confirmation
- Agent confirmation required

**Buttons**:
- Request Withdrawal
- Cancel

**Business Rules**:
- Minimum withdrawal: 50 NOK
- Maximum: current balance
- Hall agent must validate ID
- Funds transferred to cash immediately

#### 10.5 Withdraw in Bank
**Purpose**: Player requests bank transfer withdrawal

**Layout**: Form with verification steps

**Fields**:
- Withdrawal Amount
- Account Holder Name
- Bank Account Number (IBAN or local format)
- Bank Name (validated against entered account)

**Verification Section**:
- 2-factor authentication (email code)
- Phone confirmation (if enabled)

**Business Rules**:
- Bank transfers process within 1-2 business days
- Minimum withdrawal: 500 NOK (bank fee consideration)
- Bank account must match account holder name
- Fraud prevention checks applied

#### 10.6 Withdraw History
**Purpose**: Track withdrawal transactions

**Layout**: Data table with filters

**Columns**:
- Date & Time
- Amount
- Method (Hall/Bank)
- Status (Completed/Pending/Failed)
- Confirmation ID

**Filters**:
- Date Range
- Status filter
- Method filter

**Business Rules**:
- Pending withdrawals can be cancelled
- Completed withdrawals cannot be reversed
- All transfers require verification
- History retained for 7 years

---

## PDF 11: Agent V2.0

**Date**: 10.07.2024  
**Pages**: 30  
**Scope**: Agent portal V2.0 with cash management, game scheduling, and player requests

### Purpose
Portal for agents to manage hall operations, handle player requests, and perform cash reconciliation.

### Key Screens

#### 11.1 Agent Dashboard
**Purpose**: Agent overview of current operations

**Layout**: Dashboard with widget sections and side navigation

**Side Navigation**:
- Dashboard
- Add Physical Ticket
- Players Management
- Game Management
- Unique ID Management
- Cash In/Out
- Daily Balance & Settlement
- Order History
- Physical Cashout
- Sold Ticket
- Past Game Winning History
- Hall Specific Report

**Dashboard Widgets**:

**Widget 1 - Agent Info**:
- Agent Name
- Current Hall Assignment
- Shift Status (On Duty / Off Duty)
- Shift Start/End Times

**Widget 2 - Cash Summary**:
- Cash In/Out (amount fields)
- User Cash In
- User Cash Out
- Daily Balance (calculated)
- Total Cash In/Out totals

**Widget 3 - Latest Requests**:
- Table of recent player requests
- Name, Email, Type, Date
- Status indicator
- View All Pending Requests link

**Widget 4 - Top 5 Players**:
- Leaderboard showing top earning players
- Name, username, balance
- View All Players link

**Widget 5 - Ongoing Games**:
- Current game status for each game type
- Game name, hall name, start time
- Player count
- View all Games link

**Buttons**:
- Various action buttons throughout (Add Money, Create Unique ID, Register Tickets, etc.)

**Business Rules**:
- Agent can only see own hall's data
- Shift management controls system access
- Real-time data refresh
- Cash tracking per agent session

#### 11.2 Unique ID Management List
**Purpose**: View and manage all Unique IDs created by agent

**Layout**: Searchable data table

**Columns**:
- Unique ID
- Created by (Agent Name)
- Purchase Date and Time
- Expiry Date and Time
- Balance Amount
- Status of Unique ID (Active/Inactive)
- Actions (View, Edit, Delete, Assign)

**Filters**:
- Date Range selector (From/To)
- Status filter
- Search by Unique ID
- Search by Player Name

**Pagination**: Previous/Next with entry count

**Buttons**:
- Create New Unique ID
- Bulk Actions (Export, Assign, Deactivate)

**Business Rules**:
- Agents can view only own created Unique IDs (or assigned hall IDs)
- Purchase date and expiry date define validity window (typically 1 year)
- Active IDs can be used for games
- Inactive IDs cannot be used
- Balance tracked per Unique ID

#### 11.3 Unique ID Details View
**Purpose**: View complete information for a specific Unique ID

**Layout**: Details panel with action buttons

**Fields**:
- Unique ID (display)
- Unique ID Purchase Date (display)
- Unique ID Expiry Date (display)
- Hours Validity (e.g., "24 hours")
- Status (Active/Inactive indicator)
- Total Balance (display in currency)
- Overall Winnings (display in currency)
- Choose Game Type (dropdown for viewing specific game history)

**Game Details Table** (when game type selected):
- Game ID
- Game Date ID
- Unique Ticket ID
- Ticket Price
- Result (Paid/Lost)
- Winning Amount (if applicable)
- Winning Row (pattern information)

**Buttons**:
- Print (print ticket details)
- Re-Generate Unique ID (for reissue if lost)
- Back to List

**Business Rules**:
- View-only screen for normal agents
- Re-generate only available within 30 days of original
- Print generates physical ticket receipt
- Game history shows all games played with this Unique ID

#### 11.4 Transaction History
**Purpose**: Track all monetary transactions for audit

**Layout**: Data table with filters

**Columns**:
- Order Number
- Transaction ID
- Date and Time
- Transaction Type (Credit/Debit)
- Amount
- Status (Success/Failed)

**Filters**:
- Date Range (From/To picker)
- Transaction Type filter
- Search by ID

**Business Rules**:
- Shows all transactions for the agent's hall
- Pending transactions marked clearly
- Can access previous 12 months
- Export to CSV available

---

## PDF 12: Admin Import Player

**Date**: 29.08.2024  
**Pages**: 18  
**Scope**: Bulk player import functionality for admin

### Purpose
Admin tool for importing large batches of players from external sources with validation and conflict resolution.

### Key Screens

#### 12.1 Import Player Form
**Purpose**: Configure and execute player import

**Layout**: Multi-step wizard

**Step 1 - File Selection**:
- File upload field (accepts CSV, Excel)
- File format guide (shows required columns)
- Sample file download link

**Step 2 - Field Mapping**:
- Source column selector (left side)
- Target field selector (right side)
- Mapping pairs for each required field:
  - Player ID → External Player ID
  - Name → Full Name
  - Email → Email Address
  - Phone → Phone Number
  - etc.

**Step 3 - Validation**:
- Preview first 10 rows
- Error report (if any)
- Warning report (potential issues)
- Duplicate detection summary

**Step 4 - Confirmation**:
- Import count display
- Start date (for new player activation)
- Approval status selector (Approved/Pending)
- Estimated processing time

**Buttons**:
- Browse for File
- Map Fields
- Preview Import
- Execute Import
- Cancel

**Business Rules**:
- Duplicate detection by email/phone/player ID
- Required fields: Name, Email
- Optional fields: Phone, Address, DOB
- Import can be scheduled
- Confirmation email sent to each new player

---

## PDF 13: Agent Daily Balance & Settlement

**Date**: 30.08.2024  
**Pages**: 20  
**Scope**: Daily cash reconciliation and game settlement for agents

### Purpose
Daily balance management interface for agents to reconcile cash and settle games.

### Key Screens

#### 13.1 Cash In/Out Management
**Purpose**: Daily cash tracking and balance control

**Layout**: Main dashboard with popup dialogs

**Header Section**:
- Agent Name
- Current Date
- Shift Start/End Times
- Back button / Shift Log Out button

**Cash Summary Display**:
- Cash In/Out label (amount fields showing today's totals)
- User Cash In
- User Cash Out
- Daily Balance
- Total Cash In/Out (calculated)

**Control Daily Balance Dialog**:
- Daily Balance (numeric input field)
- Total Cash Balance (read-only display)
- Submit button
- Cancel button

**Business Rules**:
- Daily balance resets each shift
- All cash in/out must be recorded
- Balance verified before shift end
- Agent cannot logout with unreconciled balance

#### 13.2 Add Money - Registered User Popup
**Purpose**: Manually add funds to player account

**Layout**: Modal dialog

**Fields**:
- Enter Username (text input for player lookup)
- Current Balance (read-only display)
- Add Amount (numeric input)
- Select Payment Type (dropdown: Cash/Card/Vipps)

**Buttons**:
- Add Money
- Cancel

**Business Rules**:
- Player must be registered in system
- Transaction recorded immediately
- Player receives SMS/email notification
- Maximum single deposit: 50,000 NOK

#### 13.3 Create Unique ID Popup
**Purpose**: Generate new Unique ID with initial balance

**Layout**: Modal form

**Fields**:
- Unique ID (auto-generated, display only)
- Enter Balance (numeric input for initial balance)
- Select Payment Type (Cash/Card/Vipps)

**Business Rules**:
- System generates unique ID automatically
- Initial balance sets starting funds
- Unique ID valid for 1 year from creation
- Physical ticket can be printed immediately

#### 13.4 Daily Balance Control
**Purpose**: Reconcile end-of-shift cash

**Layout**: Form with line-item details

**Sections**:

**Cash Reconciliation**:
- Total Cash in Register (numeric input)
- Expected Balance (calculated from transactions)
- Difference (highlighted if non-zero)
- Variance explanation (text field if variance > 100 NOK)

**Settlement Report**:
- Date (display)
- Games played today (count)
- Total revenue (display)
- Total payouts (display)
- Net settlement (display)

**Buttons**:
- Confirm Daily Balance
- Settlement button (triggers settlement)

**Business Rules**:
- Balance must match within 10 NOK tolerance
- Variances > 100 NOK require explanation
- Cannot proceed without approved balance
- Settlement happens automatically after confirmation

#### 13.5 Settlement Dialog
**Purpose**: Final daily settlement reconciliation

**Layout**: Large popup with complex table

**Header**:
- Hall Name and Agent Name
- Date
- Settlement button

**Settlement Table Structure**:
- Rows for each game/machine:
  - Machine ID (e.g., "Metronida (Machine ID)")
  - IN (amount paid in)
  - OUT (amount paid out)
  - Sum Bill Kasseis:TH

**Subtotal Rows**:
- Individual machine totals
- Grand totals (sum all IN, sum all OUT)

**Machine Breakdown** (for each machine):
- In amount
- Out amount
- Difference calculation

**Special Rows** (if applicable):
- OK Bingo (Machine ID)
- Franco (Machine ID)
- Olsun (Machine ID)
- Norsk Tipping Dag (add as machine ID)
- Norsk Tipping Totall
- Norsk Riksslato Dag (add as machine ID)
- Norsk Rikssloto Totall
- Rakislatta (Propa)
- Serving/kaffe/prenger (Servings + coffee)
- Sdag (receipt)
- Bank (Bank)
- Gevind overflering bank (prices transferred via bank)
- Annet (Other)

**Balance Calculations**:
- Total IN (sum of all in amounts)
- Total OUT (sum of all out amounts)
- Difference in shifts (calculated field)

**Buttons**:
- Upload receipt button
- Submit button (marks settlement complete)

**Business Rules**:
- All machines must be reconciled
- IN and OUT amounts must match bank records
- Differences require explanation
- Settlement cannot be modified after submission

#### 13.6 Shift Log Out Confirmation
**Purpose**: Final logout with settlement confirmation

**Layout**: Popup dialog with options

**Content**:
- "Are you sure you want to logout?" (confirmation message)
- Checkboxes:
  - "Distribute bonuses to all physical players"
  - "Do you want to transfer the register ticket to next agent"
- View Cashout Details link (blue hyperlink)

**Buttons**:
- Yes (confirms logout)
- Cancel (stays in system)

**Business Rules**:
- Cannot logout without confirmed balance
- Paper tickets distribution optional
- Register transfer required if next agent assigned
- Confirmation sent to next agent if transferred

---

## PDF 14: Screen Saver Setting

**Date**: November 2024  
**Pages**: 2  
**Scope**: Admin configuration for display screen saver

### Purpose
Simple admin interface for configuring screen saver images and timing on hall TV screens.

### Key Screens

#### 14.1 Screen Saver Settings
**Purpose**: Configure images and display duration for hall screens

**Layout**: Single form with image upload section

**Fields**:

**Screen Saver Toggle**:
- Checkbox to enable/disable screen saver
- Label: "Screen Saver"

**Screen Saver Time Dropdown**:
- Options: 1 Minutes, 2 Minutes (default)
- Sets delay before saver activates

**Image and Time Section**:
- Label: "Image and Time (Please upload only 1920x1080 size image)"
- File input field ("Choose File" button)
- For each image row:
  - File upload field
  - Time duration dropdown (5 Seconds, 20 Seconds, 5 Seconds options)
  - Add button (plus icon)
  - Delete button (trash icon)

**Multiple Image Support**:
- User can add multiple images
- Each image has independent duration
- Images cycle during saver period

**Buttons**:
- Submit (saves settings)
- Cancel

**Notes**:
- Image file only in PNG and JPG format
- The image will change at set time if admin uploads multiple image
- Screen saver setting visible to player before and after login
- Image dimensions must be 1920x1080 (enforced)

**Business Rules**:
- Screen saver applies to all hall screens
- Timing between 1-20 seconds per image
- Enable/disable globally or per hall
- Changes apply immediately
- Images loop continuously

---

## PDF 15: Agent V1.0 Latest

**Date**: 06.01.2025  
**Pages**: 30  
**Scope**: Latest Agent portal with comprehensive game and cash management

### Purpose
Complete agent portal with game scheduling, ticket registration, physical cashout, and multi-game support.

### Key Screens

#### 15.1 Add Physical Tickets
**Purpose**: Register paper ticket stacks into system

**Layout**: Form with table results

**Fields**:
- Sub Game Name (dropdown selector)
- Start Time / End Time
- Notification Start Time
- Total Records to display Single Ball

**Input Fields**:
- Final ID of the stack (numeric input field)
- Initial ID of the stack (numeric input field)
- Scan button (initiates barcode scan)

**Scanned Tickets Table**:
- Columns: Ticket Type, Initial ID, Final ID, Action (delete icon)
- Shows successfully scanned/added tickets

**Buttons**:
- Scan
- Submit
- Cancel

**Business Rules**:
- Physical tickets must have continuous ID ranges
- Scan validates against database
- Duplicate range detection
- All tickets in range must be available before submission

#### 15.2 Register Sold Tickets
**Purpose**: Record sold ticket stacks for game

**Layout**: Modal dialog within main dashboard

**Fields**:
- Game: Wheel of Fortune (dropdown selector)
- Final ID of the stack (input field)
- Scan button

**Sold Tickets Table**:
- Columns: Ticket Type, Initial ID, Final ID, Tickets Sold, Action (delete)
- Shows registered tickets

**Business Rules**:
- Only unsold tickets in system can be registered
- Marking as sold removes from available pool
- Agent can sell bulk at once or single tickets

#### 15.3 Game Management - View Sub Game Details
**Purpose**: Display game configuration and settings

**Layout**: Form with nested tables

**Fields**:
- Sub Game Name (text display)
- Start Time / End Time (time displays)
- Notification Start Time (time display)
- Total Records to display Single Ball (numeric display)

**Ticket Configuration Table**:
- Columns: Ticket Color / Type / Price
- Rows for each ticket type (Small Yellow, Large Yellow, etc.)
- Shows price per ticket type
- Agent can view total numbers displayed already (e.g., "10, 45, 78, 25, 56, 33, 56, 45, 21, 70, 63, 57, 22, 33, 30, 44, 57, 7, 21")

**Game Name: Row/Pattern Price Table**:
- Columns: Row 1, Row 2, Row 3, Row 4, Full House (pattern names)
- Rows: Price per pattern
- Shows price variations by pattern

**User Type / Price Table**:
- Shows if different prices for different player types

**Buttons**:
- Cancel (back to previous screen)

**Business Rules**:
- All prices locked once game starts
- Cannot modify game settings mid-game
- Ticket numbers track for bingo drawing validation

#### 15.4 Physical Cashout
**Purpose**: Cashout physical/paper tickets with winning calculation

**Layout**: Detailed form with pattern visualization

**Section 1 - Ticket Selection**:
- Date selector (shows current date)
- Sub Game Name (text display)
- Physical Ticket Selection (table):
  - Columns: Date, Game Name, Sub Game Name (ID), Total Winnings, Pending Cashout, Action (eye icon to view)

**Section 2 - Pattern Visualization**:
- Bingo card display (5x5 grid for 75-ball, custom for others)
- Numbers marked (highlighted in different colors/shades)
- Winning patterns overlaid (lines, diagonals, full house)
- Pattern status indicators (Cashout/Rewarded/Pending)

**Section 3 - Winning Details**:
- Display of winning pattern results:
  - Raw 1: 100kr (Status: Cashout)
  - Raw 2: 100kr (Status: Rewarded)
  - etc.

**Buttons**:
- "Reward All" button (marks all patterns as rewarded)
- Backward/Forward navigation (for multiple tickets)

**Business Rules**:
- Winning patterns auto-detected from drawn numbers
- Agent can manually verify or mark as rewarded
- Multiple patterns possible per card
- Cashout button finalizes payout

#### 15.5 Sold Ticket List
**Purpose**: View all sold tickets with filtering and search

**Layout**: Data table with filters

**Columns**:
- Date and Time
- Ticket ID
- Ticket Type
- Ticket Color
- Ticket Price
- Winning pattern (if applicable)

**Filters**:
- Date Range picker (From/To)
- Ticket Type filter (dropdown)
- Search by Ticket ID

**Pagination**: Previous/Next controls

**Business Rules**:
- Shows only tickets sold at agent's hall
- Winning patterns auto-populated after game completion
- Search by ID for quick lookup
- Audit trail of all sales

#### 15.6 Past Game Winning History
**Purpose**: Review historical winning data for audit

**Layout**: Data table with filters

**Columns**:
- Date and Time
- Ticket ID
- Ticket Type
- Ticket Color
- Ticket Price
- Winning pattern

**Filters**:
- Date Range picker
- Search by Ticket ID

**Business Rules**:
- Historical data retained for 7 years
- Shows completed games only
- Useful for settling disputes
- Exportable for reporting

#### 15.7 Hall Account Report
**Purpose**: Hall-level financial reconciliation

**Layout**: Tabular report with date selector

**Fields**:
- Date selector (From/To range)
- Download button
- Report generation options

**Report Contents**:
- Daily breakdown table:
  - Columns: Date, Game Name, Sub Game Name (ID), Total Winnings, Pending Cashout, Action (view details)
  - Multiple rows per day if multiple games

**Hall Summary**:
- Total Revenue (day)
- Total Winnings (day)
- Net Profit (day)

**Business Rules**:
- Agent sees only own hall
- Data shows completed and settled games
- Can download as PDF or CSV
- Includes timestamp of generation

#### 15.8 Hall Account Report - Settlement Report
**Purpose**: Detailed settlement reconciliation

**Layout**: Large table with multiple sections

**Header**:
- Hall: Game of Hall
- Date: [selected date]
- Name: [hall name field]

**Settlement Detail Table**:
- Rows by machine/category:
  - Metronida (Machine ID): IN: 4810, OUT: 1748, Sum Bill Kasseis-TH: 3062
  - OK Bingo (Machine ID): IN: 3620, OUT: 1625, Sum Bill Kasseis-TH: 1995
  - Franco (Machine ID): IN: 4770, OUT: 1848, Sum Bill Kasseis-TH: 2922
  - Olsun: (blank row)
  - Norsk Tipping Dag (add as machine ID): (blank)
  - Norsk Tipping Totall: (blank)
  - Norsk Rikssloto Dag (add as machine ID): (blank)
  - Norsk Rikssloto Totall: (blank)
  - Rakislatta (Propa): IN: 25, OUT: (blank), Sum Bill Kasseis-TH: 25
  - Serving/kaffe/prenger (Servings + coffee): IN: 260, OUT: (blank), Sum Bill Kasseis-TH: 260
  - Sdag (receipt): (blank)
  - Bank (Bank): IN: 814, OUT: 814, Sum Bill Kasseis-TH: (blank)
  - Gevind overflering bank (prices transferred via bank): (blank)
  - Annet (Other): (blank)
  - Total (Total): IN: 10519, OUT: 8008, Sum Bill Kasseis-TH: 8902

**Calculation Rows**:
- Ending opptall kassie (Difference daily total):
  - Tra start til slut skill (Fra start til end of s...): 15656 | (blank) | 4613
  - Fuddeling av ending opptall kassie på dispaale (settlement):
    - Innskudd droppaskile (settlement Payful kassie (withdrawal from 1...): (blank) | (blank) | (blank)
  - Total (Total dispensable): (blank) | (blank) | 6813

**Difference Section**:
- "Difference in shifts" field (calculated)

**Notes Section**:
- Large text area for agent notes

**Buttons**:
- Upload receipt button
- Submit button (finalizes settlement)

**Business Rules**:
- All machine accounts reconciled
- Bank and other payment methods tracked separately
- Difference must be explained if > 100 NOK
- Cannot proceed to next shift without settlement

#### 15.9 Check for Bingo
**Purpose**: Verify winning patterns during game

**Layout**: Popup dialog

**Content**:
- Bingo card display (5x5 grid)
- Draw numbers listed
- Pattern highlighting
- Winner confirmation

**Button**:
- Hall Info link

**Business Rules**:
- Appears when valid pattern detected
- Agent confirms before payout
- Prevents accidental false wins

#### 15.10 Register More Tickets Modal
**Purpose**: Bulk register multiple tickets with quick edit

**Layout**: Modal form with table

**Fields**:
- Total of e.g. (input field for quantity)
- Refresh button (circular icon)

**Ticket Type Table**:
- Columns: Ticket Type, Initial ID, Final ID, Tickets Sold, Action (edit/delete)
- Shows Small Yellow: 1, 10, 10
- Shows Small White: 101, 200, 20
- Shows Large Yellow: 201, 300, 10
- Shows Large White: 301, 400, 40
- Shows Small Purple: 401, 500, 0
- Shows Large purple: 501, 600, 0

**Buttons**:
- Reset
- Submit

**Business Rules**:
- Bulk entry reduces time for large sales
- Validates ranges before submission
- Prevents duplicate registrations
- Calculates total automatically

---

## Cross-System Patterns

### Common Navigation
- **Admin Panel**: Side navigation menu with roles-based visibility
- **Agent Portal**: Collapsible sidebar with expandable sections
- **Player Frontend**: Header navigation with account menu

### Authentication
- **Levels**: Public (login), Authenticated (player), Admin, Agent
- **Session Management**: Timeout after inactivity (30 min player, 8 hr admin)
- **MFA**: Optional for high-balance accounts

### Data Tables Standard
- **Filtering**: Date range pickers, dropdowns, search fields
- **Pagination**: Previous/Next buttons with entry count display
- **Sorting**: Click column headers to sort ascending/descending
- **Export**: CSV/PDF download options (admin/agent)

### Cash Transactions
- **Recording**: All cash movements logged with timestamp, agent, and amount
- **Reconciliation**: Daily balance verification required before shift end
- **Audit Trail**: 7-year retention for compliance

### Game Mechanics
- **Ticket Types**: Physical, Unique ID (prepaid), Online (real-time)
- **Patterns**: Row 1-4, Full House, T-Pattern, custom per game type
- **Multipliers**: Game 5 SpinnGo uses 1x-5x multipliers
- **Settlement**: Automatic after game completion, manual verification by agent

### Business Rules Across All PDFs
1. **Player Management**: Approval required before playing, balance check before entry
2. **Hall Operations**: Each hall has assigned agent(s), independent game scheduling
3. **Financial Control**: Daily balance mandatory, settlement before shift change
4. **Reporting**: Audit trails maintained for all transactions and game results
5. **Data Retention**: Transaction history 7 years, game history 1 year minimum

---

## Document Notes

**This catalog documents 15 PDFs totaling 245+ pages of wireframes. Each screen description includes:**
- Purpose (what the screen does)
- Layout (how elements are arranged)
- Fields (input elements with labels and validation)
- Tables (data grids with column descriptions)
- Buttons (actions available)
- Business Rules (system constraints and behaviors)

**Screen descriptions are detailed enough to enable 1:1 implementation without visual styling specifications. Colors, fonts, and visual design are explicitly excluded.**

**Last Updated**: 2026-04-23  
**Status**: Complete extraction of all 15 PDFs

