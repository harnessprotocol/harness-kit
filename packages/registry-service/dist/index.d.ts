import { ResourceIdentity, CapsuleValidationFinding, CapsuleManifest, HarnessConfig, ReleaseDigest, InventorySnapshot } from '@harness-kit/core';
import { Pool } from 'pg';
import { S3Client } from '@aws-sdk/client-s3';
import { IncomingMessage, ServerResponse } from 'node:http';
export { migrate } from './migrate.js';
export { startRegistryServer } from './server.js';

type OrganizationRole = "member" | "publisher" | "administrator";
type RecordKind = "user" | "session" | "oauth-state" | "device-code" | "organization" | "membership" | "artifact" | "submission" | "release" | "release-history" | "policy" | "security-exception" | "rollout" | "audit" | "inventory";
interface RegistryRecord<T = Record<string, unknown>> {
    kind: RecordKind;
    id: string;
    organizationId?: string;
    data: T;
    createdAt: string;
    updatedAt: string;
}
interface Organization {
    id: string;
    slug: string;
    name: string;
    privateArtifactsByDefault: true;
}
interface Membership {
    userId: string;
    role: OrganizationRole;
}
interface CapsuleArtifactInput {
    type?: "capsule";
    manifest: CapsuleManifest;
    files: Array<{
        path: string;
        content: string;
        symlink?: boolean;
    }>;
    visibility?: "private" | "public";
    exceptionId?: string;
}
interface ProfileArtifactInput {
    type: "profile";
    profile: HarnessConfig;
    digest: ReleaseDigest;
    exceptionId?: string;
}
type ArtifactInput = CapsuleArtifactInput | ProfileArtifactInput;
interface ArtifactSecurityFinding {
    severity: "block" | "warn";
    code: CapsuleValidationFinding["code"] | "invalid-profile" | "credential-value";
    path?: string;
    detail: string;
}
interface Artifact {
    id: string;
    type: "capsule" | "profile";
    digest: string;
    identity: ResourceIdentity | {
        kind: "profile";
        source: string;
        name: string;
    };
    version: string;
    visibility: "private" | "public";
    blobKey: string;
    findings: ArtifactSecurityFinding[];
    createdBy: string;
}
interface Submission {
    id: string;
    artifactId: string;
    status: "pending" | "published" | "rejected";
    submittedBy: string;
    note?: string;
}
interface Release {
    id: string;
    artifactId: string;
    name: string;
    version: string;
    digest: string;
    channel: string;
    visibility: "private" | "public";
    publishedBy: string;
}
interface OrganizationPolicy {
    requiredChannel?: string;
    automaticUpdates?: boolean;
    blockingFindingCodes?: string[];
    allowedSources?: string[];
    deniedSources?: string[];
    rolloutRings?: Array<{
        name: string;
        percentage: number;
        delayMinutes?: number;
    }>;
}
interface Rollout {
    id: string;
    releaseId: string;
    releaseDigest: string;
    lastKnownGoodDigest?: string;
    status: "scheduled" | "active" | "paused" | "completed" | "rolled-back";
    effectiveAt: string;
    rings: Array<{
        name: string;
        percentage: number;
        delayMinutes?: number;
    }>;
    deviceReports: Array<{
        installationId: string;
        status: "pending" | "healthy" | "failed" | "offline" | "rolled-back";
        reportedAt: string;
    }>;
}
interface AuthPrincipal {
    userId: string;
    expiresAt: string;
}
interface DeviceAuthorization {
    deviceCode: string;
    userCode: string;
    verificationUri: string;
    expiresAt: string;
    interval: number;
}
interface RegistryServiceConfig {
    publicBaseUrl: string;
    sessionTtlSeconds?: number;
    deviceCodeTtlSeconds?: number;
    now?: () => Date;
}
type RedactedInventory = InventorySnapshot;

interface RegistryRepository {
    put<T>(record: RegistryRecord<T>): Promise<void>;
    get<T>(kind: RecordKind, id: string): Promise<RegistryRecord<T> | null>;
    list<T>(kind: RecordKind, organizationId?: string): Promise<Array<RegistryRecord<T>>>;
    delete(kind: RecordKind, id: string): Promise<void>;
}
interface BlobStore {
    putImmutable(key: string, content: Uint8Array, contentType: string): Promise<void>;
    get(key: string): Promise<Uint8Array | null>;
}

declare class MemoryRegistryRepository implements RegistryRepository {
    private records;
    put<T>(record: RegistryRecord<T>): Promise<void>;
    get<T>(kind: RecordKind, id: string): Promise<RegistryRecord<T> | null>;
    list<T>(kind: RecordKind, organizationId?: string): Promise<Array<RegistryRecord<T>>>;
    delete(kind: RecordKind, id: string): Promise<void>;
}
declare class MemoryBlobStore implements BlobStore {
    private blobs;
    putImmutable(key: string, content: Uint8Array): Promise<void>;
    get(key: string): Promise<Uint8Array | null>;
}

declare class PostgresRegistryRepository implements RegistryRepository {
    readonly pool: Pool;
    constructor(pool: Pool);
    static fromConnectionString(connectionString: string): PostgresRegistryRepository;
    put<T>(record: RegistryRecord<T>): Promise<void>;
    get<T>(kind: RecordKind, id: string): Promise<RegistryRecord<T> | null>;
    list<T>(kind: RecordKind, organizationId?: string): Promise<Array<RegistryRecord<T>>>;
    delete(kind: RecordKind, id: string): Promise<void>;
}

interface S3BlobStoreOptions {
    bucket: string;
    endpoint?: string;
    region?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle?: boolean;
}
declare class S3BlobStore implements BlobStore {
    private options;
    readonly client: S3Client;
    constructor(options: S3BlobStoreOptions);
    putImmutable(key: string, content: Uint8Array, contentType: string): Promise<void>;
    get(key: string): Promise<Uint8Array | null>;
}

interface GitHubIdentity {
    userId: string;
    login: string;
    avatarUrl?: string;
}
interface GitHubOAuthProvider {
    authorizationUrl(state: string): string;
    exchange(code: string): Promise<GitHubIdentity>;
}
declare class LiveGitHubOAuthProvider implements GitHubOAuthProvider {
    private clientId;
    private clientSecret;
    private callbackUrl;
    constructor(clientId: string, clientSecret: string, callbackUrl: string);
    authorizationUrl(state: string): string;
    exchange(code: string): Promise<GitHubIdentity>;
}

declare class RegistryError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, message: string, code: string);
}
declare class RegistryService {
    readonly repository: RegistryRepository;
    readonly blobs: BlobStore;
    readonly config: RegistryServiceConfig;
    private now;
    constructor(repository: RegistryRepository, blobs: BlobStore, config: RegistryServiceConfig);
    private iso;
    private record;
    private update;
    issueSessionForUser(userId: string, ttlSeconds?: number): Promise<string>;
    createOAuthState(returnTo?: string): Promise<string>;
    consumeOAuthState(state: string): Promise<{
        returnTo: string;
    }>;
    authenticate(token: string | undefined): Promise<AuthPrincipal>;
    startDeviceAuthorization(clientName: string): Promise<DeviceAuthorization>;
    authorizeDevice(userCode: string, userId: string): Promise<void>;
    pollDeviceAuthorization(deviceCode: string): Promise<{
        status: string;
        accessToken?: string;
        expiresIn?: number;
    }>;
    createOrganization(userId: string, input: {
        slug: string;
        name: string;
    }): Promise<Organization>;
    listOrganizations(userId: string): Promise<Organization[]>;
    private membership;
    private requireRole;
    listMembers(organizationId: string, userId: string): Promise<Membership[]>;
    setMember(organizationId: string, actorId: string, member: Membership): Promise<Membership>;
    getPolicy(organizationId: string, userId: string): Promise<OrganizationPolicy>;
    setPolicy(organizationId: string, userId: string, policy: OrganizationPolicy): Promise<OrganizationPolicy>;
    createSecurityException(organizationId: string, userId: string, input: {
        findingCodes: string[];
        reason: string;
        expiresAt?: string;
    }): Promise<{
        id: string;
    } & typeof input>;
    private validateException;
    createArtifact(organizationId: string, userId: string, input: ArtifactInput): Promise<Artifact>;
    listArtifacts(organizationId: string, userId: string): Promise<Artifact[]>;
    submitArtifact(organizationId: string, userId: string, input: {
        artifactId: string;
        note?: string;
    }): Promise<Submission>;
    listSubmissions(organizationId: string, userId: string): Promise<Submission[]>;
    publishRelease(organizationId: string, userId: string, input: {
        artifactId: string;
        name: string;
        version: string;
        channel?: string;
        public?: boolean;
        submissionId?: string;
    }): Promise<Release>;
    listReleases(organizationId: string, userId: string): Promise<Release[]>;
    repointRelease(organizationId: string, userId: string, releaseId: string, artifactId: string): Promise<Release>;
    getPublicRelease(name: string, version: string): Promise<Release | null>;
    readArtifactBlob(artifactId: string, userId?: string): Promise<Uint8Array>;
    private assertInventorySafe;
    uploadInventory(organizationId: string, userId: string, snapshot: RedactedInventory): Promise<RedactedInventory>;
    listInventory(organizationId: string, userId: string): Promise<RedactedInventory[]>;
    createRollout(organizationId: string, userId: string, input: {
        releaseId: string;
        effectiveAt?: string;
        lastKnownGoodDigest?: string;
    }): Promise<Rollout>;
    updateRollout(organizationId: string, userId: string, rolloutId: string, status: Extract<Rollout["status"], "active" | "paused" | "completed">): Promise<Rollout>;
    reportRolloutHealth(organizationId: string, userId: string, rolloutId: string, input: Rollout["deviceReports"][number]): Promise<Rollout>;
    listRollouts(organizationId: string, userId: string): Promise<Rollout[]>;
    listAudit(organizationId: string, userId: string): Promise<Array<Record<string, unknown>>>;
    private audit;
}

interface RegistryHttpOptions {
    github?: GitHubOAuthProvider;
    maxBodyBytes?: number;
    /** Test-only bootstrap, unavailable unless an explicit deployment secret is configured. */
    contractBootstrapSecret?: string;
}
declare function createRegistryHttpHandler(service: RegistryService, options?: RegistryHttpOptions): (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export { type Artifact, type ArtifactInput, type ArtifactSecurityFinding, type AuthPrincipal, type BlobStore, type CapsuleArtifactInput, type DeviceAuthorization, type GitHubIdentity, type GitHubOAuthProvider, LiveGitHubOAuthProvider, type Membership, MemoryBlobStore, MemoryRegistryRepository, type Organization, type OrganizationPolicy, type OrganizationRole, PostgresRegistryRepository, type ProfileArtifactInput, type RecordKind, type RedactedInventory, RegistryError, type RegistryHttpOptions, type RegistryRecord, type RegistryRepository, RegistryService, type RegistryServiceConfig, type Release, type Rollout, S3BlobStore, type S3BlobStoreOptions, type Submission, createRegistryHttpHandler };
