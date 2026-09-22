import { sql, SQL } from 'drizzle-orm';
import { FilterClause } from '@meow-analytics/shared';

/**
 * Maps filter field to column names for page_views and sessions tables.
 */
function getColumnExpr(table: 'page_views' | 'sessions' | 'events', field: string): SQL | null {
  switch (field) {
    case 'path':
    case 'route':
      return table === 'sessions' ? sql`landing_page` : sql`path`;
    case 'country':
      // Check country_code or country_name
      return sql`COALESCE(country_code, '')`;
    case 'device':
      return sql`device_type`;
    case 'os':
      return sql`os`;
    case 'browser':
      return sql`browser`;
    case 'referrer':
      return table === 'sessions' ? sql`referrer_hostname` : sql`COALESCE(referrer_hostname, referrer)`;
    case 'source':
      return sql`referrer_source`;
    case 'utm_source':
      return sql`utm_source`;
    case 'utm_medium':
      return sql`utm_medium`;
    case 'utm_campaign':
      return sql`utm_campaign`;
    default:
      return null;
  }
}

/**
 * Builds a single SQL condition for a filter clause.
 */
function buildSingleCondition(table: 'page_views' | 'sessions' | 'events', clause: FilterClause): SQL | null {
  const { field, operator, value } = clause;
  if (!value && operator !== 'equals' && operator !== 'not_equals') {
    return null;
  }

  // Special handling for country: check both code and name
  if (field === 'country') {
    const valUpper = value.toUpperCase();
    const valLower = value.toLowerCase();
    switch (operator) {
      case 'equals':
        return sql`(UPPER(country_code) = ${valUpper} OR LOWER(country_name) = ${valLower})`;
      case 'not_equals':
        return sql`(country_code IS NULL OR (UPPER(country_code) != ${valUpper} AND LOWER(country_name) != ${valLower}))`;
      case 'contains':
        return sql`(country_code ILIKE ${`%${value}%`} OR country_name ILIKE ${`%${value}%`})`;
      case 'starts_with':
        return sql`(country_code ILIKE ${`${value}%`} OR country_name ILIKE ${`${value}%`})`;
      case 'ends_with':
        return sql`(country_code ILIKE ${`%${value}`} OR country_name ILIKE ${`%${value}`})`;
    }
  }

  // Special handling for referrer: check both raw referrer and referrer_hostname
  if (field === 'referrer') {
    if (table === 'sessions') {
      const col = sql`referrer_hostname`;
      switch (operator) {
        case 'equals': return sql`(${col} = ${value} OR referrer_url = ${value})`;
        case 'not_equals': return sql`(${col} != ${value} AND (referrer_url IS NULL OR referrer_url != ${value}))`;
        case 'contains': return sql`(${col} ILIKE ${`%${value}%`} OR referrer_url ILIKE ${`%${value}%`})`;
        case 'starts_with': return sql`(${col} ILIKE ${`${value}%`} OR referrer_url ILIKE ${`${value}%`})`;
        case 'ends_with': return sql`(${col} ILIKE ${`%${value}`} OR referrer_url ILIKE ${`%${value}`})`;
      }
    } else {
      switch (operator) {
        case 'equals': return sql`(referrer = ${value} OR referrer_hostname = ${value} OR referrer_url = ${value})`;
        case 'not_equals': return sql`(referrer != ${value} AND referrer_hostname != ${value} AND (referrer_url IS NULL OR referrer_url != ${value}))`;
        case 'contains': return sql`(referrer ILIKE ${`%${value}%`} OR referrer_hostname ILIKE ${`%${value}%`} OR referrer_url ILIKE ${`%${value}%`})`;
        case 'starts_with': return sql`(referrer ILIKE ${`${value}%`} OR referrer_hostname ILIKE ${`${value}%`} OR referrer_url ILIKE ${`${value}%`})`;
        case 'ends_with': return sql`(referrer ILIKE ${`%${value}`} OR referrer_hostname ILIKE ${`%${value}`} OR referrer_url ILIKE ${`%${value}`})`;
      }
    }
  }

  const colExpr = getColumnExpr(table, field);
  if (!colExpr) {
    return null;
  }

  switch (operator) {
    case 'equals':
      return sql`${colExpr} = ${value}`;
    case 'not_equals':
      return sql`(${colExpr} IS NULL OR ${colExpr} != ${value})`;
    case 'contains':
      return sql`${colExpr} ILIKE ${`%${value}%`}`;
    case 'starts_with':
      return sql`${colExpr} ILIKE ${`${value}%`}`;
    case 'ends_with':
      return sql`${colExpr} ILIKE ${`%${value}`}`;
    default:
      return null;
  }
}

/**
 * Build combined SQL AND filter clauses for page_views queries.
 */
export function buildPageViewsFilterSql(filters?: FilterClause[]): SQL {
  if (!filters || filters.length === 0) {
    return sql``;
  }

  const conditions: SQL[] = [];
  for (const f of filters) {
    const cond = buildSingleCondition('page_views', f);
    if (cond) {
      conditions.push(cond);
    }
  }

  if (conditions.length === 0) {
    return sql``;
  }

  // Combine with AND
  let combined = conditions[0]!;
  for (let i = 1; i < conditions.length; i++) {
    combined = sql`${combined} AND ${conditions[i]!}`;
  }

  return sql`AND (${combined})`;
}

/**
 * Build combined SQL AND filter clauses for sessions queries.
 */
export function buildSessionsFilterSql(filters?: FilterClause[]): SQL {
  if (!filters || filters.length === 0) {
    return sql``;
  }

  const conditions: SQL[] = [];
  for (const f of filters) {
    const cond = buildSingleCondition('sessions', f);
    if (cond) {
      conditions.push(cond);
    }
  }

  if (conditions.length === 0) {
    return sql``;
  }

  let combined = conditions[0]!;
  for (let i = 1; i < conditions.length; i++) {
    combined = sql`${combined} AND ${conditions[i]!}`;
  }

  return sql`AND (${combined})`;
}

/**
 * Build combined SQL AND filter clauses for events queries.
 */
export function buildEventsFilterSql(filters?: FilterClause[]): SQL {
  if (!filters || filters.length === 0) {
    return sql``;
  }

  const conditions: SQL[] = [];
  for (const f of filters) {
    const cond = buildSingleCondition('events', f);
    if (cond) {
      conditions.push(cond);
    }
  }

  if (conditions.length === 0) {
    return sql``;
  }

  let combined = conditions[0]!;
  for (let i = 1; i < conditions.length; i++) {
    combined = sql`${combined} AND ${conditions[i]!}`;
  }

  return sql`AND (${combined})`;
}

/**
 * Build combined SQL AND filter clauses for performance_metrics queries.
 */
export function buildPerformanceFilterSql(filters?: FilterClause[]): SQL {
  if (!filters || filters.length === 0) {
    return sql``;
  }

  const conditions: SQL[] = [];
  for (const f of filters) {
    const { field, operator, value } = f;
    if (!value && operator !== 'equals' && operator !== 'not_equals') continue;

    if (field === 'country') {
      const valUpper = value.toUpperCase();
      const valLower = value.toLowerCase();
      switch (operator) {
        case 'equals':
          conditions.push(sql`(UPPER(country) = ${valUpper} OR LOWER(country_name) = ${valLower})`);
          break;
        case 'not_equals':
          conditions.push(sql`(country IS NULL OR (UPPER(country) != ${valUpper} AND LOWER(country_name) != ${valLower}))`);
          break;
        case 'contains':
          conditions.push(sql`(country ILIKE ${`%${value}%`} OR country_name ILIKE ${`%${value}%`})`);
          break;
        case 'starts_with':
          conditions.push(sql`(country ILIKE ${`${value}%`} OR country_name ILIKE ${`${value}%`})`);
          break;
        case 'ends_with':
          conditions.push(sql`(country ILIKE ${`%${value}`} OR country_name ILIKE ${`%${value}`})`);
          break;
      }
      continue;
    }

    let colExpr: SQL | null = null;
    if (field === 'path' || field === 'route') {
      colExpr = sql`path`;
    } else if (field === 'device') {
      colExpr = sql`device`;
    }

    if (!colExpr) continue;

    switch (operator) {
      case 'equals':
        conditions.push(sql`${colExpr} = ${value}`);
        break;
      case 'not_equals':
        conditions.push(sql`(${colExpr} IS NULL OR ${colExpr} != ${value})`);
        break;
      case 'contains':
        conditions.push(sql`${colExpr} ILIKE ${`%${value}%`}`);
        break;
      case 'starts_with':
        conditions.push(sql`${colExpr} ILIKE ${`${value}%`}`);
        break;
      case 'ends_with':
        conditions.push(sql`${colExpr} ILIKE ${`%${value}`}`);
        break;
    }
  }

  if (conditions.length === 0) {
    return sql``;
  }

  let combined = conditions[0]!;
  for (let i = 1; i < conditions.length; i++) {
    combined = sql`${combined} AND ${conditions[i]!}`;
  }

  return sql`AND (${combined})`;
}
