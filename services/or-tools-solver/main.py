"""
OR-Tools Shift Solver Microservice

Accepts the same SolverInput DTOs as the TypeScript solver and returns
SolverResult. Uses Google OR-Tools CP-SAT for constraint optimization.

Endpoint: POST /solve
Health:   GET /health
"""

import time
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Lancelot OR-Tools Shift Solver", version="1.0.0")

# ─── DTOs (mirror of TypeScript types) ────────────────────────────────────────


class SolverEmployee(BaseModel):
    id: str
    displayName: str
    department: str
    roles: list[str]
    employmentPercentage: float
    isActive: bool


class AssignedWorker(BaseModel):
    userId: str
    role: str


class SolverShift(BaseModel):
    id: str
    date: str  # YYYY-MM-DD
    shiftType: str
    department: str
    requiredWorkers: int
    assignedWorkers: list[AssignedWorker]
    startTime: str  # HH:MM
    endTime: str  # HH:MM


class AvailabilityConstraint(BaseModel):
    dayOfWeek: int
    shiftType: str
    availability: str  # available | unavailable | prefer | prefer_not


class SolverAvailability(BaseModel):
    userId: str
    weekStartDate: str
    constraints: list[AvailabilityConstraint]


class SolverHistoricalLoad(BaseModel):
    userId: str
    totalHours: float
    nightShifts: int
    weekendShifts: int
    heavyShifts: int
    periodDays: int


class SolverConstraints(BaseModel):
    minRestHours: int
    maxConsecutiveDays: int
    maxHoursPerWeek: int
    respectPreferences: bool
    allowOvertime: bool


class SolverOptions(BaseModel):
    constraints: SolverConstraints
    prioritize: str  # fairness | coverage | preferences | cost
    maxImprovementIterations: int


class SolverInput(BaseModel):
    employees: list[SolverEmployee]
    shifts: list[SolverShift]
    availability: list[SolverAvailability]
    historicalLoad: list[SolverHistoricalLoad]
    options: SolverOptions


class SolverAssignment(BaseModel):
    shiftId: str
    userId: str
    userName: str
    role: str
    date: str
    shiftType: str
    startTime: str
    endTime: str
    department: str
    score: float
    confidence: float


class SolverConflict(BaseModel):
    type: str
    severity: str
    description: str
    affectedShiftId: Optional[str] = None
    affectedUserId: Optional[str] = None
    suggestion: Optional[str] = None


class EmployeeFairness(BaseModel):
    userId: str
    userName: str
    totalHours: float
    nightShifts: int
    weekendShifts: int
    heavyShifts: int
    deviationFromAverage: float


class FairnessSummary(BaseModel):
    employeeMetrics: list[EmployeeFairness]
    averageHours: float
    standardDeviation: float
    maxDeviation: float
    nightShiftVariance: float
    weekendShiftVariance: float
    fairnessScore: float


class ObjectiveSummary(BaseModel):
    objectiveUsed: str
    totalPenalty: float
    coveragePercent: float
    preferencesSatisfied: int
    preferencesTotal: int
    improvementIterations: int
    swapsPerformed: int


class SolverResult(BaseModel):
    assignments: list[SolverAssignment]
    conflicts: list[SolverConflict]
    fairnessSummary: FairnessSummary
    objectiveSummary: ObjectiveSummary
    solverStatus: str  # optimal | feasible | infeasible | timeout
    solverVersion: str
    solverTimeMs: float


# ─── Solver Logic ─────────────────────────────────────────────────────────────

SOLVER_VERSION = "1.0.0-ortools"


def compute_shift_hours(shift: SolverShift) -> int:
    start_h = int(shift.startTime.split(":")[0])
    end_h = int(shift.endTime.split(":")[0])
    return end_h - start_h if end_h > start_h else 24 - start_h + end_h


def is_weekend(date_str: str) -> bool:
    from datetime import datetime

    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return dt.weekday() in (4, 5)  # Friday=4, Saturday=5 in Python


def is_night(shift_type: str) -> bool:
    return shift_type.lower() == "night"


def solve_shifts(inp: SolverInput) -> SolverResult:
    """Run the OR-Tools CP-SAT solver on the shift scheduling problem."""
    from ortools.sat.python import cp_model

    start_time = time.time()
    model = cp_model.CpModel()

    employees = inp.employees
    shifts = inp.shifts
    options = inp.options
    constraints = options.constraints

    emp_ids = [e.id for e in employees]
    emp_map = {e.id: e for e in employees}

    # Build availability lookup
    avail_map: dict[str, dict[str, str]] = {}
    for a in inp.availability:
        user_avail: dict[str, str] = {}
        for c in a.constraints:
            user_avail[f"{c.dayOfWeek}-{c.shiftType}"] = c.availability
        avail_map[a.userId] = user_avail

    # Historical load lookup
    hist_map = {h.userId: h for h in inp.historicalLoad}

    # ── Decision variables: x[e][s] = 1 if employee e is assigned to shift s ──
    x: dict[tuple[str, str], cp_model.IntVar] = {}
    for e in emp_ids:
        for s in shifts:
            x[(e, s.id)] = model.NewBoolVar(f"x_{e}_{s.id}")

    # ── Pre-assigned workers are fixed ──
    pre_assigned: set[tuple[str, str]] = set()
    for s in shifts:
        for aw in s.assignedWorkers:
            if aw.userId in emp_map:
                model.Add(x[(aw.userId, s.id)] == 1)
                pre_assigned.add((aw.userId, s.id))

    # ── Hard constraint: unavailability ──
    from datetime import datetime

    for s in shifts:
        dt = datetime.strptime(s.date, "%Y-%m-%d")
        day_of_week = dt.weekday()
        # Python weekday: Mon=0..Sun=6; JS getDay: Sun=0..Sat=6
        js_day = (day_of_week + 1) % 7
        avail_key = f"{js_day}-{s.shiftType}"
        for e in emp_ids:
            if (e, s.id) in pre_assigned:
                continue
            user_avail = avail_map.get(e, {})
            if user_avail.get(avail_key) == "unavailable":
                model.Add(x[(e, s.id)] == 0)

    # ── Staffing constraint: required workers per shift ──
    for s in shifts:
        needed = s.requiredWorkers
        model.Add(sum(x[(e, s.id)] for e in emp_ids) <= needed)

    # ── Max hours per week per employee ──
    for e in emp_ids:
        total_hours = sum(
            x[(e, s.id)] * compute_shift_hours(s) for s in shifts
        )
        if constraints.allowOvertime:
            model.Add(total_hours <= constraints.maxHoursPerWeek + 12)
        else:
            model.Add(total_hours <= constraints.maxHoursPerWeek)

    # ── Objective: maximize assignments with preference/fairness weighting ──
    objective_terms = []
    for s in shifts:
        dt = datetime.strptime(s.date, "%Y-%m-%d")
        js_day = (dt.weekday() + 1) % 7
        avail_key = f"{js_day}-{s.shiftType}"
        for e in emp_ids:
            weight = 10  # base weight for filling a slot
            user_avail = avail_map.get(e, {})
            pref = user_avail.get(avail_key)
            if pref == "prefer":
                weight += 5
            elif pref == "prefer_not":
                weight -= 3
            elif pref == "available":
                weight += 2
            # Historical load penalty for fairness
            if options.prioritize == "fairness":
                hist = hist_map.get(e)
                if hist and hist.periodDays > 0:
                    penalty = int(hist.totalHours / hist.periodDays)
                    weight -= penalty
            objective_terms.append(x[(e, s.id)] * max(weight, 1))

    model.Maximize(sum(objective_terms))

    # ── Solve ──
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 30.0
    status = solver.Solve(model)

    solve_time_ms = (time.time() - start_time) * 1000

    # ── Extract results ──
    assignments: list[SolverAssignment] = []
    conflicts: list[SolverConflict] = []
    emp_hours: dict[str, float] = {e: 0.0 for e in emp_ids}
    emp_night: dict[str, int] = {e: 0 for e in emp_ids}
    emp_weekend: dict[str, int] = {e: 0 for e in emp_ids}
    emp_heavy: dict[str, int] = {e: 0 for e in emp_ids}

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for s in shifts:
            assigned_count = 0
            for e in emp_ids:
                if solver.Value(x[(e, s.id)]) == 1:
                    emp = emp_map[e]
                    hours = compute_shift_hours(s)
                    emp_hours[e] += hours
                    if is_night(s.shiftType):
                        emp_night[e] += 1
                    if is_weekend(s.date):
                        emp_weekend[e] += 1
                    if (is_night(s.shiftType) and is_weekend(s.date)) or hours > 10:
                        emp_heavy[e] += 1
                    assignments.append(
                        SolverAssignment(
                            shiftId=s.id,
                            userId=e,
                            userName=emp.displayName,
                            role=emp.roles[0] if emp.roles else "worker",
                            date=s.date,
                            shiftType=s.shiftType,
                            startTime=s.startTime,
                            endTime=s.endTime,
                            department=s.department,
                            score=80.0,
                            confidence=0.9 if status == cp_model.OPTIMAL else 0.7,
                        )
                    )
                    assigned_count += 1
            if assigned_count < s.requiredWorkers:
                conflicts.append(
                    SolverConflict(
                        type="understaffed",
                        severity="warning",
                        description=f"Shift {s.date} ({s.shiftType}) needs {s.requiredWorkers} but got {assigned_count}",
                        affectedShiftId=s.id,
                        suggestion="Consider adjusting constraints or adding staff",
                    )
                )
        solver_status = "optimal" if status == cp_model.OPTIMAL else "feasible"
    elif status == cp_model.INFEASIBLE:
        solver_status = "infeasible"
        conflicts.append(
            SolverConflict(
                type="constraint_violation",
                severity="error",
                description="No feasible schedule exists with current constraints",
                suggestion="Relax constraints (max hours, rest period) or add employees",
            )
        )
    else:
        solver_status = "timeout"
        conflicts.append(
            SolverConflict(
                type="constraint_violation",
                severity="warning",
                description="Solver timed out before finding optimal solution",
                suggestion="Reduce problem size or increase timeout",
            )
        )

    # ── Fairness metrics ──
    all_hours = list(emp_hours.values())
    avg_hours = sum(all_hours) / len(all_hours) if all_hours else 0
    import math

    variance = (
        sum((h - avg_hours) ** 2 for h in all_hours) / len(all_hours)
        if all_hours
        else 0
    )
    std_dev = math.sqrt(variance)
    max_dev = max(abs(h - avg_hours) for h in all_hours) if all_hours else 0

    night_vals = list(emp_night.values())
    weekend_vals = list(emp_weekend.values())
    night_var = (
        sum((n - sum(night_vals) / len(night_vals)) ** 2 for n in night_vals)
        / len(night_vals)
        if night_vals
        else 0
    )
    weekend_var = (
        sum((w - sum(weekend_vals) / len(weekend_vals)) ** 2 for w in weekend_vals)
        / len(weekend_vals)
        if weekend_vals
        else 0
    )

    fairness_score = max(0, 100 - std_dev * 10 - max_dev * 5)

    employee_metrics = [
        EmployeeFairness(
            userId=e,
            userName=emp_map[e].displayName,
            totalHours=emp_hours[e],
            nightShifts=emp_night[e],
            weekendShifts=emp_weekend[e],
            heavyShifts=emp_heavy[e],
            deviationFromAverage=emp_hours[e] - avg_hours,
        )
        for e in emp_ids
    ]

    total_required = sum(s.requiredWorkers for s in shifts)
    coverage_pct = (len(assignments) / total_required * 100) if total_required > 0 else 0

    return SolverResult(
        assignments=assignments,
        conflicts=conflicts,
        fairnessSummary=FairnessSummary(
            employeeMetrics=employee_metrics,
            averageHours=avg_hours,
            standardDeviation=std_dev,
            maxDeviation=max_dev,
            nightShiftVariance=night_var,
            weekendShiftVariance=weekend_var,
            fairnessScore=min(100, fairness_score),
        ),
        objectiveSummary=ObjectiveSummary(
            objectiveUsed=options.prioritize,
            totalPenalty=0,
            coveragePercent=coverage_pct,
            preferencesSatisfied=0,
            preferencesTotal=0,
            improvementIterations=0,
            swapsPerformed=0,
        ),
        solverStatus=solver_status,
        solverVersion=SOLVER_VERSION,
        solverTimeMs=solve_time_ms,
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "healthy", "service": "or-tools-solver", "version": SOLVER_VERSION}


@app.post("/solve", response_model=SolverResult)
def solve_endpoint(inp: SolverInput):
    try:
        return solve_shifts(inp)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=5003)
