PRAGMA foreign_keys = ON;

-- Project workspaces own every evaluation resource.
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (name)
);

-- Providers retain reusable model-service and credential references.
CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL,
    base_url TEXT,
    credential_ref TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects (id),
    UNIQUE (project_id, name),
    UNIQUE (project_id, id)
);

CREATE INDEX IF NOT EXISTS ix_providers_project_id
ON providers (project_id);

-- Candidates describe immutable model configurations under evaluation.
CREATE TABLE IF NOT EXISTS candidates (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    name TEXT NOT NULL,
    adapter TEXT NOT NULL,
    model_name TEXT NOT NULL,
    system_prompt TEXT NOT NULL DEFAULT '',
    generation_parameters TEXT NOT NULL DEFAULT '{}'
        CHECK (json_valid(generation_parameters)),
    tool_definitions TEXT NOT NULL DEFAULT '[]'
        CHECK (json_valid(tool_definitions)),
    response_format TEXT
        CHECK (response_format IS NULL OR json_valid(response_format)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects (id),
    FOREIGN KEY (project_id, provider_id) REFERENCES providers (project_id, id),
    UNIQUE (project_id, name),
    UNIQUE (project_id, id)
);

CREATE INDEX IF NOT EXISTS ix_candidates_project_id
ON candidates (project_id);

-- Datasets contain immutable collections of scenarios and rule bindings.
CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects (id),
    UNIQUE (project_id, name),
    UNIQUE (project_id, id)
);

CREATE INDEX IF NOT EXISTS ix_datasets_project_id
ON datasets (project_id);

-- Scenarios store type-specific input while keeping private rules separate.
CREATE TABLE IF NOT EXISTS scenarios (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    scenario_key TEXT NOT NULL,
    name TEXT NOT NULL,
    scenario_type TEXT NOT NULL
        CHECK (scenario_type IN ('single_turn', 'multi_turn', 'tool_use')),
    input TEXT NOT NULL CHECK (json_valid(input)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (dataset_id) REFERENCES datasets (id),
    UNIQUE (dataset_id, scenario_key),
    UNIQUE (dataset_id, id)
);

CREATE INDEX IF NOT EXISTS ix_scenarios_dataset_id
ON scenarios (dataset_id);

-- Rule bindings attach defaults to datasets or expectations to scenarios.
CREATE TABLE IF NOT EXISTS rule_bindings (
    id TEXT PRIMARY KEY,
    dataset_id TEXT NOT NULL,
    scenario_id TEXT,
    rule_key TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    role TEXT NOT NULL
        CHECK (role IN ('required', 'scored', 'informational')),
    severity TEXT NOT NULL
        CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    parameters TEXT NOT NULL CHECK (json_valid(parameters)),
    applies_to TEXT CHECK (applies_to IS NULL OR json_valid(applies_to)),
    created_at TEXT NOT NULL,
    FOREIGN KEY (dataset_id) REFERENCES datasets (id),
    FOREIGN KEY (dataset_id, scenario_id) REFERENCES scenarios (dataset_id, id),
    CHECK (
        (scenario_id IS NULL AND applies_to IS NOT NULL)
        OR (scenario_id IS NOT NULL AND applies_to IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dataset_default_rule_key
ON rule_bindings (dataset_id, rule_key)
WHERE scenario_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_scenario_rule_key
ON rule_bindings (scenario_id, rule_key)
WHERE scenario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_rule_bindings_dataset_id
ON rule_bindings (dataset_id);

CREATE INDEX IF NOT EXISTS ix_rule_bindings_scenario_id
ON rule_bindings (scenario_id);

-- Run settings control repeated attempts, scoring, and timeouts.
CREATE TABLE IF NOT EXISTS run_settings (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    attempts_per_scenario INTEGER NOT NULL
        CHECK (attempts_per_scenario > 0),
    timeout_ms INTEGER NOT NULL CHECK (timeout_ms > 0),
    pass_threshold REAL NOT NULL
        CHECK (pass_threshold >= 0.0 AND pass_threshold <= 1.0),
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects (id),
    UNIQUE (project_id, name),
    UNIQUE (project_id, id)
);

CREATE INDEX IF NOT EXISTS ix_run_settings_project_id
ON run_settings (project_id);

-- Evaluation runs combine one candidate, dataset, and run-settings record.
CREATE TABLE IF NOT EXISTS evaluation_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    candidate_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    run_settings_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    queued_at TEXT,
    cancel_requested_at TEXT,
    snapshot_digest TEXT,
    error TEXT CHECK (error IS NULL OR json_valid(error)),
    FOREIGN KEY (project_id) REFERENCES projects (id),
    FOREIGN KEY (project_id, candidate_id) REFERENCES candidates (project_id, id),
    FOREIGN KEY (project_id, dataset_id) REFERENCES datasets (project_id, id),
    FOREIGN KEY (project_id, run_settings_id) REFERENCES run_settings (project_id, id)
);

CREATE INDEX IF NOT EXISTS ix_evaluation_runs_project_id
ON evaluation_runs (project_id);

-- Frozen private evaluation configuration is never used as an invocation payload.
CREATE TABLE IF NOT EXISTS execution_snapshots (
    run_id TEXT PRIMARY KEY REFERENCES evaluation_runs (id),
    version INTEGER NOT NULL CHECK (version = 1),
    configuration TEXT NOT NULL CHECK (json_valid(configuration)),
    digest TEXT NOT NULL
);

-- Each allocated attempt has a stable identity and ordered position within its run.
CREATE TABLE IF NOT EXISTS execution_attempts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES evaluation_runs (id),
    scenario_id TEXT NOT NULL REFERENCES scenarios (id),
    scenario_key TEXT NOT NULL,
    scenario_name TEXT NOT NULL,
    scenario_type TEXT NOT NULL,
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    position INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (
        status IN ('pending', 'running', 'completed', 'failed', 'timed_out', 'skipped')
    ),
    started_at TEXT,
    completed_at TEXT,
    error TEXT CHECK (error IS NULL OR json_valid(error)),
    UNIQUE (run_id, scenario_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS ix_execution_attempts_run
ON execution_attempts (run_id, position);

-- Normalized observations and transport artifacts stay separate from future grading results.
CREATE TABLE IF NOT EXISTS execution_evidence (
    execution_id TEXT PRIMARY KEY REFERENCES execution_attempts (id),
    normalized TEXT NOT NULL CHECK (json_valid(normalized)),
    request TEXT CHECK (request IS NULL OR json_valid(request)),
    response TEXT CHECK (response IS NULL OR json_valid(response)),
    cost TEXT CHECK (cost IS NULL OR json_valid(cost))
);

-- Evaluation headers and automatic baseline checks are independent of invocation status.
CREATE TABLE IF NOT EXISTS attempt_evaluations (
    execution_id TEXT PRIMARY KEY REFERENCES execution_evidence (execution_id),
    verdict TEXT NOT NULL CHECK (
        verdict IN ('pass', 'fail', 'cannot_evaluate', 'error', 'not_evaluated')
    ),
    evaluator_version TEXT NOT NULL,
    evaluated_at TEXT NOT NULL,
    automatic_tool_validation TEXT NOT NULL CHECK (json_valid(automatic_tool_validation))
);

-- Each frozen rule binding produces exactly one outcome for an evaluated attempt.
CREATE TABLE IF NOT EXISTS rule_evaluation_results (
    execution_id TEXT NOT NULL REFERENCES attempt_evaluations (execution_id),
    rule_binding_id TEXT NOT NULL,
    rule_key TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('required', 'scored', 'informational')),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
    outcome TEXT NOT NULL CHECK (outcome IN ('pass', 'fail', 'cannot_evaluate', 'error')),
    reason TEXT NOT NULL,
    explanation TEXT NOT NULL,
    evidence_references TEXT NOT NULL CHECK (json_valid(evidence_references)),
    PRIMARY KEY (execution_id, rule_binding_id)
);

-- Terminal reports retain complete aggregation output without duplicating evidence.
CREATE TABLE IF NOT EXISTS evaluation_run_summaries (
    run_id TEXT NOT NULL REFERENCES evaluation_runs (id),
    summary TEXT NOT NULL CHECK (json_valid(summary)),
    generated_at TEXT NOT NULL,
    PRIMARY KEY (run_id)
);
