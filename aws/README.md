# MechPro AWS Runtime

## Storage deletion worker

The storage deletion worker drains committed S3 deletion records from PostgreSQL. It runs once per minute through EventBridge and idempotently ensures its outbox table exists before claiming work.

### Local validation

Start and initialize the repository PostgreSQL fixture, then run the AWS tests:

```powershell
pnpm --dir aws run db:up
pnpm --dir aws run db:schema
pnpm --dir aws test
```

The lease integration test requires PostgreSQL 16 and uses independent connections to verify `FOR UPDATE SKIP LOCKED`, live-lease exclusion, and expired-lease recovery:

```powershell
$env:TEST_DATABASE_URL = "postgresql://mechpro:mechpro@localhost:5433/mechpro2"
pnpm --dir aws run test:storage-integration
```

### Build and deploy

Build the Lambda bundle and package `storageDeletionWorker.js` at the root of a zip file:

```powershell
pnpm exec node aws/build.mjs
Compress-Archive -Path aws/dist/storageDeletionWorker.js -DestinationPath aws/dist/storageDeletionWorker.zip -Force
aws s3 cp aws/dist/storageDeletionWorker.zip "s3://<artifact-bucket>/<artifact-key>"
```

Deploy the dedicated stack with resources owned by the main application stack:

```powershell
aws cloudformation deploy `
  --stack-name MechProStorageDeletionWorker `
  --template-file aws/infra/storage-deletion-worker.yaml `
  --capabilities CAPABILITY_IAM `
  --parameter-overrides `
    ArtifactBucket=<artifact-bucket> `
    ArtifactKey=<artifact-key> `
    DatabaseSecretArn=<aurora-secret-arn> `
    FilesBucketName=<uploads-bucket> `
    "PrivateSubnetIds=<subnet-a>,<subnet-b>" `
    "DatabaseSecurityGroupIds=<lambda-security-group>"
```

`DatabaseSecretArn` must reference a standard Aurora credential secret containing `host`, `port`, `dbname`, `username`, and `password`. The Lambda security group must be allowed to reach Aurora on port 5432.

### Deployed smoke test

Invoke the deployed worker synchronously and validate its response:

```powershell
pnpm --dir aws run smoke:storage-deletion-worker -- `
  --stack MechProStorageDeletionWorker `
  --region us-east-1
```

A successful empty-queue response is:

```text
Storage deletion worker smoke test passed: {"succeeded":0,"failed":0}
```