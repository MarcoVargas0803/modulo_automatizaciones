function buildExecutionFilters(query, values) {
    const filters = [];

    if (query.status) {
        values.push(query.status);
        filters.push(`v.display_status = $${values.length}`);
    }

    if (query.processCode){
        values.push(query.processCode);
        filters.push(`v.process_code = $${values.length}`);
    }

    if (query.dateFrom) {
        values.push(query.dateFrom);
        filters.push(`v.created_at_mx >= $${values.length}::timestamp`);
    }

    if (query.dateTo) {
        values.push(query.dateTo);
        filters.push(`v.created_at_mx < $${values.length}::date + INTERVAL '1 day'`);
    }

    if (query.search) {
        values.push(`%${query.search}%`);
        filters.push(`(
            v.execution_id ILIKE $${values.length}
            OR v.workflow_name ILIKE $${values.length}
            OR v.process_name ILIKE $${values.length}
            OR v.source_reference ILIKE $${values.length}
            OR v.error_message ILIKE $${values.length}
            OR EXISTS (
                SELECT 1
                FROM audit_portal.v_execution_subjects_web s
                WHERE s.execution_id = v.execution_id
                  AND s.process_code = v.process_code
                  AND (
                    s.subject_key ILIKE $${values.length}
                    OR s.display_name ILIKE $${values.length}
                    OR s.display_subject_type ILIKE $${values.length}
                    OR s.subject_type ILIKE $${values.length}
                  )
            )
            )`);
    }

    return {
        filterSql: filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '',
        values,
    };
}

module.exports = {
    buildExecutionFilters,
};
