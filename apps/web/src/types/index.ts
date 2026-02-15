// Common types used across the application

export type UserRole = 'admin' | 'manager' | 'employee' | 'broadcast_planner' | 'broadcast_coordinator' | 'accessibility_coordinator';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Stats {
  activeBroadcasts: number;
  employeesOnShift: number;
  availableEquipment: number;
  openIssues: number;
}

export interface Notification {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  timestamp: Date;
  read: boolean;
}

// Ticket System Types
export type TicketStatus = 'open' | 'assigned' | 'in_progress' | 'resolved' | 'on_hold' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent' | 'critical';
export type TicketCategory = 'hardware' | 'software' | 'network' | 'access' | 'broadcast' | 'mcr' | 'production' | 'other';

export interface TicketUser {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  department?: {
    id: string;
    name: string;
    hebrewName: string;
  };
}

export interface TicketComment {
  id: string;
  user: TicketUser;
  comment: string;
  isInternal: boolean;
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: number;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  reporter?: TicketUser;
  assignee?: TicketUser;
  department?: {
    id: string;
    name: string;
    hebrewName: string;
  };
  resolution?: string;
  estimatedHours?: number;
  actualHours?: number;
  resolvedAt?: string;
  closedBy?: TicketUser;
  closedAt?: string;
  dueDate?: string;
  tags: string[];
  metadata?: any;
  comments: TicketComment[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTicketInput {
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  assigneeId?: string;
  departmentId?: string;
  dueDate?: string;
  tags?: string[];
}

export interface UpdateTicketInput {
  title?: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  assigneeId?: string;
  resolution?: string;
  estimatedHours?: number;
  actualHours?: number;
  dueDate?: string;
  tags?: string[];
} 