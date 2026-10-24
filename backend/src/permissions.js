/* ===================================================================
   Who can do what. The browser hides buttons, but these checks decide.

   Platform role (our company):  admin · user
   Company roles:                owner · admin · member
   Project roles:                owner · manager · member · viewer

   A project's effective role is the higher of
     • the person's own project role, and
     • "manager" if they are an owner/admin of the company the project belongs to.
   =================================================================== */
import { HttpError } from './security.js';

export const PROJECT_ROLES = ['viewer', 'member', 'manager', 'owner'];
export const COMPANY_ROLES = ['member', 'admin', 'owner'];
const rank = (list, role) => list.indexOf(role);

export const PROJECT_CAN = {
    read: 'viewer',          // open the project, download, export
    edit: 'member',          // change work items, plans, everything in the project document
    manageAccess: 'manager', // add people, change their access, remove them
    delete: 'owner'          // delete the project (company owners/admins too)
};

export async function projectAccess(repo, user, projectId) {
    const project = await repo.projects.byId(projectId);
    if (!project) return null;
    const own = await repo.projectMembers.get(projectId, user.id);
    let role = own?.role || null;
    let companyRole = null;
    if (project.companyId) {
        const cm = await repo.companyMembers.get(project.companyId, user.id);
        companyRole = cm?.role || null;
        if (companyRole === 'owner' || companyRole === 'admin') {
            if (rank(PROJECT_ROLES, role) < rank(PROJECT_ROLES, 'manager')) role = 'manager';
        }
    }
    return role ? { project, role, companyRole } : null;
}

export function can(access, action) {
    if (!access) return false;
    if (action === 'delete' && (access.companyRole === 'owner' || access.companyRole === 'admin')) return true;
    return rank(PROJECT_ROLES, access.role) >= rank(PROJECT_ROLES, PROJECT_CAN[action]);
}

// Loads the project and checks the action, or throws 404/403
export async function requireProject(repo, user, projectId, action) {
    const access = await projectAccess(repo, user, projectId);
    // Not found and not allowed look the same, so ids can't be probed
    if (!access) throw new HttpError(404, 'not_found', 'Project not found.');
    if (!can(access, action)) {
        const msg = { edit: 'You have view-only access to this project.', manageAccess: 'Only the project owner or a manager can change who has access.', delete: 'Only the project owner can delete it.' }[action] || 'Not allowed.';
        throw new HttpError(403, 'forbidden', msg);
    }
    return access;
}

// A manager can grant up to manager; nobody grants "owner" (use transfer)
export function canGrant(access, role) {
    if (!PROJECT_ROLES.includes(role) || role === 'owner') return false;
    return rank(PROJECT_ROLES, role) <= rank(PROJECT_ROLES, access.role === 'owner' ? 'manager' : access.role);
}

export async function requireCompany(repo, user, companyId, minRole = 'member') {
    const company = await repo.companies.byId(companyId);
    const m = company && await repo.companyMembers.get(companyId, user.id);
    if (!m) throw new HttpError(404, 'not_found', 'Company not found.');
    if (rank(COMPANY_ROLES, m.role) < rank(COMPANY_ROLES, minRole)) throw new HttpError(403, 'forbidden', 'Only company owners and admins can do this.');
    return { company, role: m.role, membership: m };
}
