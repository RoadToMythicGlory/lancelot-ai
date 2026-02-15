// Worker Reports System Types

export interface FreelancerProfile {
  id: string;
  userId: string;
  contractType: 'daily' | 'weekly' | 'monthly' | 'project_based' | 'hourly';
  hourlyRate?: number;
  dailyRate?: number;
  contractStartDate?: Date;
  contractEndDate?: Date;
  currencyCode: string;
  
  // Tax & Legal
  taxId?: string;
  businessLicense?: string;
  isVatRegistered: boolean;
  vatNumber?: string;
  
  // Bank Information
  bankName?: string;
  bankBranch?: string;
  
  // Skills & Certifications
  primarySkills: string[];
  certifications: any[];
  languages: string[];
  
  // Availability
  maxHoursPerDay: number;
  maxDaysPerWeek: number;
  preferredDepartments: string[];
  availableForOvernight: boolean;
  availableForWeekends: boolean;
  
  // Emergency Contact
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  
  // Performance Tracking
  reliabilityScore: number;
  qualityScore: number;
  totalBroadcastsWorked: number;
  totalHoursWorked: number;
  
  // Status & Notes
  status: 'active' | 'inactive' | 'on_hold' | 'terminated';
  managerNotes?: string;
  internalNotes?: string;
  
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkReport {
  id: string;
  userId: string;
  
  // Date & Time Information
  workDate: Date;
  shiftStartTime?: Date;
  shiftEndTime?: Date;
  actualStartTime?: Date;
  actualEndTime?: Date;
  
  // Work Summary
  totalHoursWorked?: number;
  breakDurationMinutes: number;
  overtimeHours: number;
  
  // Department & Location
  primaryDepartmentId?: string;
  workLocation: string;
  workType: 'regular' | 'overtime' | 'weekend' | 'holiday' | 'emergency';
  
  // Broadcast Work Summary
  broadcastsWorked: number;
  primaryPosition?: string;
  
  // Daily Tasks & Achievements
  dailySummary?: string;
  tasksCompleted: string[];
  challengesFaced?: string;
  equipmentUsed: string[];
  
  // Status & Approval
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submittedAt?: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  
  // Pay Calculation (for freelancers)
  calculatedPay?: number;
  payCalculationMethod?: 'hourly' | 'daily' | 'broadcast_count' | 'fixed';
  payNotes?: string;
  payApproved: boolean;
  payApprovedBy?: string;
  payApprovedAt?: Date;
  
  // Metadata
  weatherConditions?: string;
  specialCircumstances?: string;
  trainingCompleted: string[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkSession {
  id: string;
  workReportId: string;
  userId: string;
  
  // Session Details
  sessionStart: Date;
  sessionEnd?: Date;
  durationMinutes?: number;
  
  // Session Type & Location
  sessionType: 'work' | 'break' | 'lunch' | 'meeting' | 'travel' | 'setup' | 'breakdown';
  activityCategory?: 'production' | 'technical' | 'administrative' | 'meeting' | 'training';
  location?: string;
  departmentId?: string;
  
  // Activity Description
  activityDescription?: string;
  equipmentUsed: string[];
  peopleWorkedWith: string[];
  
  // If related to broadcast
  broadcastEventId?: string;
  broadcastRole?: string;
  
  // Location tracking
  checkedInBy?: 'manual' | 'qr_code' | 'nfc' | 'gps' | 'supervisor';
  
  // Quality & Performance
  performanceRating?: number; // 1-5 scale
  supervisorNotes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface BroadcastWorkLog {
  id: string;
  workReportId: string;
  userId: string;
  
  // Broadcast Information
  broadcastEventId: string;
  broadcastTitle?: string;
  broadcastDate: Date;
  
  // Position & Role Details
  position: string;
  positionLevel?: 'junior' | 'senior' | 'lead' | 'supervisor';
  isPrimaryRole: boolean;
  
  // Time Tracking
  assignmentStart: Date;
  assignmentEnd?: Date;
  setupStart?: Date;
  broadcastStart?: Date;
  broadcastEnd?: Date;
  breakdownEnd?: Date;
  
  // Work Details
  equipmentAssigned: string[];
  cameraNumbers: number[];
  specialEquipment: string[];
  location?: string;
  venue?: string;
  
  // Performance & Quality
  performanceNotes?: string;
  technicalIssues: string[];
  solutionsImplemented: string[];
  supervisorFeedback?: string;
  performanceScore?: number; // 1-5 scale
  
  // Freelancer Specific
  broadcastFee?: number;
  travelAllowance?: number;
  equipmentBonus?: number;
  
  // Status
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface HourlyActivityLog {
  id: string;
  workReportId: string;
  userId: string;
  
  // Time Slot
  activityDate: Date;
  hourStart: number;
  minuteStart: number;
  durationMinutes: number;
  
  // Activity Details
  activityType: 'work' | 'break' | 'meeting' | 'travel' | 'training' | 'standby';
  primaryTask?: string;
  detailedDescription?: string;
  
  // Location & Equipment
  location?: string;
  departmentId?: string;
  equipmentUsed: string[];
  
  // If broadcast-related
  broadcastEventId?: string;
  broadcastRole?: string;
  
  // People & Collaboration
  workedWithUsers: string[];
  externalContacts: string[];
  
  // Productivity & Quality
  productivityRating?: number; // 1-5 scale
  energyLevel?: number; // 1-5 scale
  stressLevel?: number; // 1-5 scale
  
  // Notes
  notes?: string;
  challenges?: string;
  achievements?: string;
  
  createdAt: Date;
}

export interface WorkApproval {
  id: string;
  workReportId: string;
  
  // Approval Details
  approvedBy: string;
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'changes_requested';
  approvalDate: Date;
  
  // Approval Scope
  approvalType: 'hours' | 'performance' | 'pay' | 'all';
  
  // Hours Verification
  approvedHours?: number;
  approvedOvertime?: number;
  hourAdjustments?: string;
  
  // Performance Review
  overallPerformance?: number; // 1-5 scale
  attendanceRating?: number; // 1-5 scale
  qualityRating?: number; // 1-5 scale
  teamworkRating?: number; // 1-5 scale
  
  // Pay Approval (for freelancers)
  approvedPay?: number;
  payAdjustments?: string;
  bonusAmount?: number;
  deductionAmount?: number;
  
  // Feedback
  supervisorComments?: string;
  areasForImprovement: string[];
  recognitionPoints: string[];
  
  // Follow-up Actions
  requiresFollowUp: boolean;
  followUpActions: string[];
  nextReviewDate?: Date;
  
  createdAt: Date;
}

export interface FreelancerPayment {
  id: string;
  userId: string;
  freelancerProfileId?: string;
  
  // Payment Period
  paymentPeriodStart: Date;
  paymentPeriodEnd: Date;
  paymentDate?: Date;
  
  // Work Summary
  totalDaysWorked?: number;
  totalHoursWorked?: number;
  totalBroadcasts?: number;
  totalOvertimeHours?: number;
  
  // Payment Calculation
  baseAmount: number;
  overtimeAmount: number;
  bonusAmount: number;
  deductionAmount: number;
  travelAllowance: number;
  equipmentAllowance: number;
  
  // Tax & Deductions
  grossAmount?: number;
  taxAmount: number;
  socialSecurity: number;
  otherDeductions: number;
  netAmount?: number;
  
  // Payment Status
  status: 'pending' | 'approved' | 'paid' | 'disputed';
  paymentMethod?: 'bank_transfer' | 'check' | 'cash' | 'digital_wallet';
  transactionReference?: string;
  
  // Documentation
  invoiceNumber?: string;
  receiptUrl?: string;
  notes?: string;
  
  // Approval
  approvedBy?: string;
  approvedAt?: Date;
  paidBy?: string;
  paidAt?: Date;
  
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkReportTemplate {
  id: string;
  name: string;
  description?: string;
  
  // Template Scope
  departmentId?: string;
  jobTitle?: string;
  workType?: 'regular' | 'freelancer' | 'intern' | 'supervisor';
  
  // Template Structure
  requiredFields: string[];
  defaultActivities: string[];
  hourlyBreakdownRequired: boolean;
  performanceTrackingEnabled: boolean;
  
  // Approval Requirements
  requiresSupervisorApproval: boolean;
  autoApproveUnderHours?: number;
  
  templateData: any;
  
  isActive: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkStatistics {
  id: string;
  userId: string;
  
  // Time Period
  periodType: 'daily' | 'weekly' | 'monthly' | 'yearly';
  periodDate: Date;
  
  // Work Metrics
  totalHours?: number;
  regularHours?: number;
  overtimeHours?: number;
  daysWorked?: number;
  broadcastsWorked?: number;
  
  // Performance Metrics
  averagePerformanceScore?: number;
  punctualityScore?: number;
  attendanceRate?: number;
  
  // Department Distribution
  departmentHours: any; // {dept_id: hours}
  positionHours: any; // {position: hours}
  
  // Freelancer Metrics
  totalEarnings?: number;
  averageDailyRate?: number;
  
  // Calculated Fields
  efficiencyScore?: number;
  reliabilityScore?: number;
  
  calculatedAt: Date;
}

// Input Types
export interface CreateFreelancerProfileInput {
  userId: string;
  contractType: 'daily' | 'weekly' | 'monthly' | 'project_based' | 'hourly';
  hourlyRate?: number;
  dailyRate?: number;
  contractStartDate?: Date;
  contractEndDate?: Date;
  currencyCode?: string;
  taxId?: string;
  businessLicense?: string;
  isVatRegistered?: boolean;
  vatNumber?: string;
  bankName?: string;
  bankBranch?: string;
  primarySkills?: string[];
  certifications?: any[];
  languages?: string[];
  maxHoursPerDay?: number;
  maxDaysPerWeek?: number;
  preferredDepartments?: string[];
  availableForOvernight?: boolean;
  availableForWeekends?: boolean;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  managerNotes?: string;
  internalNotes?: string;
}

export interface UpdateFreelancerProfileInput {
  contractType?: 'daily' | 'weekly' | 'monthly' | 'project_based' | 'hourly';
  hourlyRate?: number;
  dailyRate?: number;
  contractStartDate?: Date;
  contractEndDate?: Date;
  currencyCode?: string;
  taxId?: string;
  businessLicense?: string;
  isVatRegistered?: boolean;
  vatNumber?: string;
  bankName?: string;
  bankBranch?: string;
  primarySkills?: string[];
  certifications?: any[];
  languages?: string[];
  maxHoursPerDay?: number;
  maxDaysPerWeek?: number;
  preferredDepartments?: string[];
  availableForOvernight?: boolean;
  availableForWeekends?: boolean;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  status?: 'active' | 'inactive' | 'on_hold' | 'terminated';
  managerNotes?: string;
  internalNotes?: string;
}

export interface CreateWorkReportInput {
  userId: string;
  workDate: Date;
  shiftStartTime?: Date;
  shiftEndTime?: Date;
  actualStartTime?: Date;
  actualEndTime?: Date;
  totalHoursWorked?: number;
  breakDurationMinutes?: number;
  overtimeHours?: number;
  primaryDepartmentId?: string;
  workLocation?: string;
  workType: 'regular' | 'overtime' | 'weekend' | 'holiday' | 'emergency';
  broadcastsWorked?: number;
  primaryPosition?: string;
  dailySummary?: string;
  tasksCompleted?: string[];
  challengesFaced?: string;
  equipmentUsed?: string[];
  weatherConditions?: string;
  specialCircumstances?: string;
  trainingCompleted?: string[];
}

export interface UpdateWorkReportInput {
  shiftStartTime?: Date;
  shiftEndTime?: Date;
  actualStartTime?: Date;
  actualEndTime?: Date;
  totalHoursWorked?: number;
  breakDurationMinutes?: number;
  overtimeHours?: number;
  primaryDepartmentId?: string;
  workLocation?: string;
  workType?: 'regular' | 'overtime' | 'weekend' | 'holiday' | 'emergency';
  broadcastsWorked?: number;
  primaryPosition?: string;
  dailySummary?: string;
  tasksCompleted?: string[];
  challengesFaced?: string;
  equipmentUsed?: string[];
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
  weatherConditions?: string;
  specialCircumstances?: string;
  trainingCompleted?: string[];
}

export interface CreateWorkSessionInput {
  workReportId: string;
  sessionStart: Date;
  sessionEnd?: Date;
  sessionType: 'work' | 'break' | 'lunch' | 'meeting' | 'travel' | 'setup' | 'breakdown';
  activityCategory?: 'production' | 'technical' | 'administrative' | 'meeting' | 'training';
  location?: string;
  departmentId?: string;
  activityDescription?: string;
  equipmentUsed?: string[];
  peopleWorkedWith?: string[];
  broadcastEventId?: string;
  broadcastRole?: string;
  checkedInBy?: 'manual' | 'qr_code' | 'nfc' | 'gps' | 'supervisor';
  performanceRating?: number;
  supervisorNotes?: string;
}

export interface CreateBroadcastWorkLogInput {
  workReportId: string;
  broadcastEventId: string;
  broadcastTitle?: string;
  broadcastDate: Date;
  position: string;
  positionLevel?: 'junior' | 'senior' | 'lead' | 'supervisor';
  isPrimaryRole?: boolean;
  assignmentStart: Date;
  assignmentEnd?: Date;
  setupStart?: Date;
  broadcastStart?: Date;
  broadcastEnd?: Date;
  breakdownEnd?: Date;
  equipmentAssigned?: string[];
  cameraNumbers?: number[];
  specialEquipment?: string[];
  location?: string;
  venue?: string;
  performanceNotes?: string;
  technicalIssues?: string[];
  solutionsImplemented?: string[];
  supervisorFeedback?: string;
  performanceScore?: number;
  broadcastFee?: number;
  travelAllowance?: number;
  equipmentBonus?: number;
}

export interface CreateHourlyActivityLogInput {
  workReportId: string;
  activityDate: Date;
  hourStart: number;
  minuteStart?: number;
  durationMinutes?: number;
  activityType: 'work' | 'break' | 'meeting' | 'travel' | 'training' | 'standby';
  primaryTask?: string;
  detailedDescription?: string;
  location?: string;
  departmentId?: string;
  equipmentUsed?: string[];
  broadcastEventId?: string;
  broadcastRole?: string;
  workedWithUsers?: string[];
  externalContacts?: string[];
  productivityRating?: number;
  energyLevel?: number;
  stressLevel?: number;
  notes?: string;
  challenges?: string;
  achievements?: string;
}

export interface CreateWorkApprovalInput {
  workReportId: string;
  approvalType: 'hours' | 'performance' | 'pay' | 'all';
  approvedHours?: number;
  approvedOvertime?: number;
  hourAdjustments?: string;
  overallPerformance?: number;
  attendanceRating?: number;
  qualityRating?: number;
  teamworkRating?: number;
  approvedPay?: number;
  payAdjustments?: string;
  bonusAmount?: number;
  deductionAmount?: number;
  supervisorComments?: string;
  areasForImprovement?: string[];
  recognitionPoints?: string[];
  requiresFollowUp?: boolean;
  followUpActions?: string[];
  nextReviewDate?: Date;
}

export interface CreateFreelancerPaymentInput {
  userId: string;
  paymentPeriodStart: Date;
  paymentPeriodEnd: Date;
  baseAmount: number;
  overtimeAmount?: number;
  bonusAmount?: number;
  deductionAmount?: number;
  travelAllowance?: number;
  equipmentAllowance?: number;
  taxAmount?: number;
  socialSecurity?: number;
  otherDeductions?: number;
  paymentMethod?: 'bank_transfer' | 'check' | 'cash' | 'digital_wallet';
  notes?: string;
}

// Filter Types
export interface WorkReportFilter {
  userId?: string;
  departmentId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
  workType?: 'regular' | 'overtime' | 'weekend' | 'holiday' | 'emergency';
  position?: string;
}

export interface FreelancerProfileFilter {
  status?: 'active' | 'inactive' | 'on_hold' | 'terminated';
  contractType?: 'daily' | 'weekly' | 'monthly' | 'project_based' | 'hourly';
  departmentId?: string;
  skills?: string[];
  availableForOvernight?: boolean;
  availableForWeekends?: boolean;
}

export interface FreelancerPaymentFilter {
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: 'pending' | 'approved' | 'paid' | 'disputed';
  paymentMethod?: 'bank_transfer' | 'check' | 'cash' | 'digital_wallet';
}

// Report Types
export interface WorkerPerformanceReport {
  user: any; // User type
  period: DateRange;
  totalDaysWorked: number;
  totalHoursWorked: number;
  averageHoursPerDay: number;
  totalOvertimeHours: number;
  totalBroadcasts: number;
  averagePerformanceScore?: number;
  punctualityScore?: number;
  attendanceRate?: number;
  reliabilityScore?: number;
  departmentBreakdown: DepartmentWorkBreakdown[];
  positionBreakdown: PositionWorkBreakdown[];
  weeklyHoursTrend: WeeklyHours[];
  performanceTrend: WeeklyPerformance[];
  totalEarnings?: number;
  averageDailyRate?: number;
  paymentHistory: FreelancerPayment[];
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface DepartmentWorkBreakdown {
  department: any; // Department type
  hoursWorked: number;
  broadcastsWorked: number;
  averagePerformance?: number;
}

export interface PositionWorkBreakdown {
  position: string;
  hoursWorked: number;
  broadcastsWorked: number;
  averagePerformance?: number;
}

export interface WeeklyHours {
  weekStartDate: Date;
  regularHours: number;
  overtimeHours: number;
  totalHours: number;
}

export interface WeeklyPerformance {
  weekStartDate: Date;
  averageScore: number;
  attendanceRate: number;
  punctualityScore: number;
} 