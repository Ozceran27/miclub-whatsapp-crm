import { getAdministrationReadModel } from "../../repositories/administration/administrationReadRepository.js";

export const getAdministrationInitialReadModel = (clubId: string) => getAdministrationReadModel(clubId);
