# Department Users - Setup Complete

## Summary

Successfully created **66 users** across all **22 departments** in the Lancelot system.

## What Was Created

- **3 users per department**
- Each user has:
  - Professional email address (format: firstname.lastname@example.com)
  - Secure password (format: FirstInitialLastname@Lancelot!)
  - Assigned department and role
  - Active status
  - System role: DEPARTMENT_USER

## Departments Covered

### IT Category
- IT (System Administrator, Developer, Support)
- IT Media (Media Systems Engineer, Broadcast IT Specialist)

### MCR Category
- Playout (Playout Operator, Senior Playout Operator)
- Ingest (Ingest Operator, Senior Ingest Operator)
- MCR General (MCR Operator, MCR Supervisor)

### Warehouse Category
- Warehouse (Warehouse Manager, Equipment Handler)

### Visuals Category
- Video Editors (Video Editor, Senior Video Editor)

### New Media Category
- New Media Producers (Producer, Senior Producer)
- New Media Editors (Editor, Senior Editor)
- New Media Analysts (Analyst, Senior Analyst)

### News Category
- Producers (News Producer, Senior News Producer)
- Desk (Desk Editor, Senior Desk Editor)
- Editors (News Editor, Senior News Editor)
- Production Assistants (Production Assistant, Senior Production Assistant)
- Researchers (Researcher, Senior Researcher)

### Production Category
- VTR (VTR Operator, Senior VTR Operator)
- Directors (Director, Senior Director)
- CG (CG Operator, Senior CG Operator)
- Commentators (Commentator, Senior Commentator)
- Soundmen (Sound Engineer, Senior Sound Engineer)
- Technicians (Technician, Senior Technician)
- External Technicians (External Technician)

## Credentials File

The file **`DEPARTMENT_USER_CREDENTIALS.txt`** contains:
- All user emails and passwords
- Organized by department
- Each user's name, role, email, and password

## Important Notes

1. **Security**: The credentials file contains sensitive information. Please:
   - Share passwords securely with individual users
   - Ask users to change their passwords on first login
   - Delete the credentials file after distribution

2. **Password Format**: All passwords follow the pattern: `FirstInitialLastname@Lancelot!`
   - Example: David Cohen → `Dcohen@Lancelot!`

3. **System Admin**: The existing system admin remains:
   - Email: admin@example.com
   - Password: ChangeMe123!

## How to Run Again

If you need to create more users or recreate the existing ones:

```powershell
# From the root directory
./seed-department-users.ps1

# Or directly from api-gateway
cd services/api-gateway
npm run seed:department-users
```

## Next Steps

1. Distribute passwords securely to each user
2. Ensure users change their passwords on first login
3. Delete the DEPARTMENT_USER_CREDENTIALS.txt file
4. Consider implementing a password reset mechanism
5. Set up proper permissions for each department's pages

## Technical Details

- Users are stored in MongoDB
- Passwords are hashed using bcrypt (10 rounds)
- Each user has systemRole: 'DEPARTMENT_USER'
- Users are linked to their departments with appropriate roles


