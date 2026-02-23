# AI Logger Project - Development Checklist

This file serves as a mandatory checklist to verify the project state after any significant changes, such as adding new features, installing dependencies, or modifying core configurations.

## 1. Dependency Verification
- [ ] Run `pnpm install` in the `app` directory to ensure all dependencies are correctly resolved.
- [ ] Check for any peer dependency warnings or version conflicts in the terminal output.
- [ ] Verify that newly added packages are present in `package.json` under the correct section (`dependencies` vs `devDependencies`).

## 2. Build and Compilation
- [ ] Run `pnpm build` in the `app` directory.
- [ ] Ensure the build completes successfully without any TypeScript compilation errors (`TSxxxx`).
- [ ] Verify that the `dist` folder is generated and contains the compiled output.

## 3. Application Startup
- [ ] Run `pnpm start:dev` in the `app` directory.
- [ ] Verify that the NestJS application starts successfully.
- [ ] Check the terminal output for any runtime errors, missing module exceptions, or database connection issues.
- [ ] Ensure the Swagger documentation is accessible at `http://localhost:3000/api` (or the configured port/path).

## 4. Database Integrity
- [ ] If entity schemas were modified, verify that TypeORM successfully synchronizes the database (if `synchronize: true` is set).
- [ ] If encountering constraint errors (e.g., `NOT NULL constraint failed`), consider clearing the local SQLite database (`rm database.sqlite`) and restarting the app to recreate the schema.

## 5. Feature Testing
- [ ] Test the newly implemented feature using Swagger UI or a tool like Postman/cURL.
- [ ] For authentication features, verify registration, login, and access to protected routes using the generated JWT.

## 6. Code Quality
- [ ] Run `pnpm lint` to check for any ESLint warnings or errors.
- [ ] Run `pnpm format` to ensure code formatting is consistent.

---
**Note to AI Assistant:** Always refer to this checklist and perform the necessary verification steps (using terminal commands) after making substantial changes to the codebase.
