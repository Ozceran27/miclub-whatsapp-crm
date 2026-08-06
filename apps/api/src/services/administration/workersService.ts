import type { AdministrationWorkersResponse } from "@miclub/shared";
import { getWorkersPage } from "../../repositories/administration/workersRepository.js";

export const getAdministrationWorkers = async (clubId: string, limit: number, offset: number): Promise<AdministrationWorkersResponse> => {
  const page = await getWorkersPage(clubId, limit, offset);
  return {
    items: page.rows.map((worker) => ({
      id: worker.id,
      clubId: worker.club_id,
      personId: worker.person_id,
      code: worker.code,
      displayName: worker.display_name,
      firstName: worker.first_name,
      lastName: worker.last_name,
      dni: worker.dni,
      phone: worker.phone,
      email: worker.email,
      sectorIds: worker.sector_ids,
      activityIds: worker.activities.map((activity) => activity.id),
      activities: worker.activities,
      permissions: worker.permissions,
      role: worker.role,
      sector: worker.sector,
      salary: worker.salary == null ? null : Number(worker.salary),
      status: worker.status,
      systemAccess: worker.system_access,
      employmentStartDate: worker.employment_start_date,
      employmentEndDate: worker.employment_end_date,
      isActive: worker.status === "active",
      notes: worker.notes,
      roleGuard: {
        isDirector: (worker.role ?? "").toLocaleLowerCase() === "director",
        activeDirectorCount: Number(worker.active_director_count),
        canRemoveDirectorRole: (worker.role ?? "").toLocaleLowerCase() !== "director" || Number(worker.active_director_count) > 1,
        ...((worker.role ?? "").toLocaleLowerCase() === "director" && Number(worker.active_director_count) <= 1
          ? { reason: "El club debe conservar al menos un Director activo." }
          : {})
      },
      createdAt: worker.created_at,
      updatedAt: worker.updated_at
    })),
    page: Math.floor(offset / limit) + 1,
    pageSize: limit,
    total: page.total,
    totalPages: Math.ceil(page.total / limit),
    dataSource: page.dataSource,
    limitations: page.limitations
  };
};
