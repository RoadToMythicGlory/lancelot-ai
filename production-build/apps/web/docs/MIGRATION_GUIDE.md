# Migration Guide

## Migrating from Static Message to useMessage Hook

To fix the "Static function can not consume context" warning, all components need to be updated to use the `useMessage` hook instead of the static `message` import.

### Before:
```tsx
import { message } from 'antd';

const MyComponent = () => {
  const handleClick = () => {
    message.success('Success!');
    message.error('Error!');
  };
};
```

### After:
```tsx
import { useMessage } from '@/hooks';

const MyComponent = () => {
  const message = useMessage();
  
  const handleClick = () => {
    message.success('Success!');
    message.error('Error!');
  };
};
```

### Components that need updating:

1. **MCR Components:**
   - `MCRMapManager.tsx`
   - `MCRDashboard.tsx`
   - `AzureCalendar.tsx`

2. **Broadcast Components:**
   - `BroadcastArrayModal.tsx`
   - `PlayoutDepartmentModal.tsx`
   - `WarehouseModal.tsx`

3. **Page Components:**
   - `mcr/page.tsx`
   - `warehouse/page.tsx`
   - `tickets/page.tsx`
   - `tickets/create/page.tsx`
   - `shifts/page.tsx`
   - `broadcast-planning/page.tsx`
   - `broadcast-array/page.tsx`

### Steps to migrate:

1. Remove the static import: `import { message } from 'antd';`
2. Add the hook import: `import { useMessage } from '@/hooks';`
3. Inside your component, add: `const message = useMessage();`
4. Use the message instance as before

This ensures that messages respect the theme context and eliminates console warnings. 