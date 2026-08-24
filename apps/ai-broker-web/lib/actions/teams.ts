// Client-side helpers for team management, backed by the /api/teams,
// /api/teams/[id]/invite, and /api/users/search routes.

export interface TeamMemberUser {
  id: string
  name: string
  email: string
  image?: string | null
}

export interface TeamMember {
  id: string
  role: string
  user: TeamMemberUser
}

export interface Team {
  id: string
  organizationId: string
  name: string
  description: string | null
  upgradeMembers: boolean
  members: TeamMember[]
}

async function parseJson(res: Response) {
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, data }
}

export async function getTeams(): Promise<Team[]> {
  return getUserTeams()
}

export async function getUserTeams(): Promise<Team[]> {
  const res = await fetch("/api/teams")
  const { ok, data } = await parseJson(res)
  return ok && data.success ? data.data : []
}

export async function createTeam(name: string, description?: string, upgradeMembers?: boolean) {
  const res = await fetch("/api/teams", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, upgradeMembers }),
  })
  const { ok, data } = await parseJson(res)
  return ok ? { success: true, data: data.data } : { success: false, error: data.error }
}

export async function updateTeam(id: string, name: string, description?: string, upgradeMembers?: boolean) {
  const res = await fetch(`/api/teams/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, upgradeMembers }),
  })
  const { ok, data } = await parseJson(res)
  return ok ? { success: true } : { success: false, error: data.error }
}

export async function deleteTeam(id: string) {
  const res = await fetch(`/api/teams/${id}`, { method: "DELETE" })
  const { ok, data } = await parseJson(res)
  return ok ? { success: true } : { success: false, error: data.error }
}

export async function inviteMemberToTeam(teamId: string, email: string) {
  const res = await fetch(`/api/teams/${teamId}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
  const { ok, data } = await parseJson(res)
  return ok ? { success: true, invited: !!data.invited } : { success: false, error: data.error }
}

export async function removeMemberFromTeam(teamId: string, userId: string) {
  const res = await fetch(`/api/teams/${teamId}/members?userId=${encodeURIComponent(userId)}`, {
    method: "DELETE",
  })
  const { ok, data } = await parseJson(res)
  return ok ? { success: true } : { success: false, error: data.error }
}

export async function searchUsers(query: string): Promise<TeamMemberUser[]> {
  const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
  const { ok, data } = await parseJson(res)
  return ok && data.success ? data.data : []
}
