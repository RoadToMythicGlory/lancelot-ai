// Helper function to validate constraints against department laws
export const validateConstraintsAgainstLaws = (
  userConstraints: any[],
  departmentConfig: any
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  // Try to get constraint laws from localStorage first
  let constraintLaws = null;
  const deptId = departmentConfig?.departmentId || departmentConfig?.departmentName;
  if (deptId) {
    const storedLaws = localStorage.getItem(`constraintLaws_${deptId}`);
    if (storedLaws) {
      try {
        constraintLaws = JSON.parse(storedLaws);
      } catch (e) {
        console.error('Failed to parse stored constraint laws:', e);
      }
    }
  }
  
  // Check if constraint laws are enabled
  if (!constraintLaws?.enabled && !departmentConfig?.constraints?.enableConstraintLaws) {
    return { isValid: true, errors: [] };
  }
  
  // Use constraint laws from localStorage if available, otherwise from config
  const laws = constraintLaws || departmentConfig.constraints;
  
  // Count constraints by type
  const constraintCounts: { [key: string]: number } = {};
  const dayTypeCounts: { business: { open: number; total: number }; weekend: { open: number; total: number } } = {
    business: { open: 0, total: 5 }, // Sunday-Thursday
    weekend: { open: 0, total: 2 }   // Friday-Saturday
  };
  const shiftTypeCounts: { [shiftType: string]: { [constraintType: string]: number } } = {};
  let totalOpenDays = 0;
  const totalDays = 7;
  
  // Analyze user constraints
  userConstraints.forEach(constraint => {
    const { dayOfWeek, shiftType, availability } = constraint;
    
    // Count constraint types
    if (availability === 'prefer_not' || availability === 'unavailable') {
      constraintCounts[availability] = (constraintCounts[availability] || 0) + 1;
      
      // Count by shift type
      if (!shiftTypeCounts[shiftType]) {
        shiftTypeCounts[shiftType] = {};
      }
      shiftTypeCounts[shiftType][availability] = (shiftTypeCounts[shiftType][availability] || 0) + 1;
    }
  });
  
  // Calculate open days (days without any 'unavailable' constraints)
  for (let day = 0; day < 7; day++) {
    const hasUnavailable = userConstraints.some(c => 
      c.dayOfWeek === day && c.availability === 'unavailable'
    );
    
    if (!hasUnavailable) {
      totalOpenDays++;
      if (day >= 0 && day <= 4) { // Sunday-Thursday
        dayTypeCounts.business.open++;
      } else { // Friday-Saturday
        dayTypeCounts.weekend.open++;
      }
    }
  }
  
  // Law 1: Not more than X constraints of type Y
  const type1Laws = laws.type1 || laws.constraintLaws_type1 || [];
  if (Array.isArray(type1Laws) && type1Laws.length > 0) {
    type1Laws.forEach((rule: any) => {
      const count = constraintCounts[rule.constraintType] || 0;
      if (count > rule.amount) {
        const typeLabel = rule.constraintType === 'prefer_not' ? 'מעדיף שלא' : 'לא זמין';
        errors.push(`לא ניתן להגדיר יותר מ-${rule.amount} הגבלות מסוג "${typeLabel}" (הגדרת ${count})`);
      }
    });
  }
  
  // Law 2: Leave at least X days of type Y open
  const type2Laws = laws.type2 || laws.constraintLaws_type2 || [];
  if (Array.isArray(type2Laws) && type2Laws.length > 0) {
    type2Laws.forEach((rule: any) => {
      const openCount = dayTypeCounts[rule.dayType as 'business' | 'weekend'].open;
      if (openCount < rule.amount) {
        const dayTypeLabel = rule.dayType === 'business' ? 'עסקים' : 'סוף שבוע';
        errors.push(`יש להשאיר לפחות ${rule.amount} ימי ${dayTypeLabel} פתוחים (נותרו ${openCount})`);
      }
    });
  }
  
  // Law 3: Leave at least X days in the week open
  const type3Laws = laws.type3 || laws.constraintLaws_type3 || [];
  if (Array.isArray(type3Laws) && type3Laws.length > 0) {
    type3Laws.forEach((rule: any) => {
      if (totalOpenDays < rule.amount) {
        errors.push(`יש להשאיר לפחות ${rule.amount} ימים בשבוע פתוחים (נותרו ${totalOpenDays})`);
      }
    });
  }
  
  // Law 4: Can't request more than X of constraint type Y in shift type Z
  const type4Laws = laws.type4 || laws.constraintLaws_type4 || [];
  if (Array.isArray(type4Laws) && type4Laws.length > 0) {
    type4Laws.forEach((rule: any) => {
      const count = shiftTypeCounts[rule.shiftType]?.[rule.constraintType] || 0;
      if (count > rule.amount) {
        const constraintLabel = rule.constraintType === 'prefer_not' ? 'מעדיף שלא' : 'לא זמין';
        const shiftLabel = departmentConfig?.shiftTypes?.find((st: any) => st.type === rule.shiftType)?.label || rule.shiftType;
        errors.push(`לא ניתן להגדיר יותר מ-${rule.amount} הגבלות "${constraintLabel}" במשמרת ${shiftLabel} (הגדרת ${count})`);
      }
    });
  }
  
  // Law 5: Can't have more than X constraints on specific weekdays
  const type5Laws = laws.type5 || laws.constraintLaws_type5 || [];
  if (Array.isArray(type5Laws) && type5Laws.length > 0) {
    type5Laws.forEach((rule: any) => {
      if (!rule.weekdays || rule.weekdays.length === 0) return;
      
      let totalCount = 0;
      rule.weekdays.forEach((weekday: number) => {
        const weekdayConstraints = userConstraints.filter(c => 
          c.dayOfWeek === weekday && 
          (c.availability === 'unavailable' || c.availability === 'prefer_not')
        );
        totalCount += weekdayConstraints.length;
      });
      
      if (totalCount > rule.amount) {
        const dayNames = rule.weekdays.map((d: number) => 
          ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][d]
        ).join(', ');
        errors.push(`לא ניתן להגדיר יותר מ-${rule.amount} הגבלות בימים: ${dayNames} (הגדרת ${totalCount})`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};
