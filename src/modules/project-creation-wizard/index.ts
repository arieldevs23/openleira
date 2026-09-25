export { default as ProjectCreationWizard } from '@/modules/project-creation-wizard/ProjectCreationWizard';
// WorkspacePathField: used by the office module's add-workspace dialog to pick a folder the same way the project wizard does.
export { default as WorkspacePathField } from '@/modules/project-creation-wizard/WorkspacePathField';
// cloneWorkspaceWithProgress / fetchGithubTokenCredentials: used by the office module's
// "add workspace from GitHub" to clone a repository (with a stored token or over SSH) before
// turning the clone into a workspace.
export { cloneWorkspaceWithProgress, fetchGithubTokenCredentials } from '@/modules/project-creation-wizard/utils/workspaceApi';
