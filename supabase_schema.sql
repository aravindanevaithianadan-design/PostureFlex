-- Supabase SQL Schema for PostureFlex
-- 1. Patients Table
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(20) NOT NULL,
    notes TEXT,
    assessor_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    user_id UUID DEFAULT auth.uid() -- Link to authenticated user if using multi-user setup
);
-- Enable Row Level Security
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
-- Create Policies
CREATE POLICY "Allow authenticated read patients" 
    ON public.patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert patients" 
    ON public.patients FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update patients" 
    ON public.patients FOR UPDATE TO authenticated USING (true);
-- 2. Sessions Table
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_uuid UUID REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    session_type VARCHAR(50) NOT NULL, -- e.g., Initial, Progress, Follow-up
    module_type VARCHAR(10) NOT NULL, -- BPT1 or BPT2
    risk_level VARCHAR(20) NOT NULL, -- Normal, Mild Deviation, Significant Deviation
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read sessions" 
    ON public.sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert sessions" 
    ON public.sessions FOR INSERT TO authenticated WITH CHECK (true);
-- 3. Measurements Table
CREATE TABLE IF NOT EXISTS public.measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
    joint_name VARCHAR(50) NOT NULL, -- e.g., Left Knee, Right Knee, Left Hip, Right Hip, Trunk, Left Ankle, Right Ankle
    measured_angle NUMERIC(5,2) NOT NULL,
    reference_range VARCHAR(50) NOT NULL, -- e.g., 80-100, 0-30
    deviation NUMERIC(5,2) NOT NULL,
    status VARCHAR(50) NOT NULL, -- Normal, Mild Deviation, Significant Deviation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read measurements" 
    ON public.measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert measurements" 
    ON public.measurements FOR INSERT TO authenticated WITH CHECK (true);
-- 4. Reports Table
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE NOT NULL,
    pdf_url TEXT,
    interpretation TEXT NOT NULL,
    recommendations TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated read reports" 
    ON public.reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert reports" 
    ON public.reports FOR INSERT TO authenticated WITH CHECK (true);
-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_patients_id ON public.patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_patient ON public.sessions(patient_uuid);
CREATE INDEX IF NOT EXISTS idx_measurements_session ON public.measurements(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_session ON public.reports(session_id);
