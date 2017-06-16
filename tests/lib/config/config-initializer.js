/**
 * @fileoverview Tests for configInitializer.
 * @author Ilya Volodin
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const assert = require("chai").assert,
    fs = require("fs"),
    path = require("path"),
    os = require("os"),
    sinon = require("sinon"),
    sh = require("shelljs"),
    autoconfig = require("../../../lib/config/autoconfig"),
    npmUtil = require("../../../lib/util/npm-util");

const originalDir = process.cwd();
const proxyquire = require("proxyquire").noPreserveCache();

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

let answers = {};

describe("configInitializer", () => {

    let fixtureDir,
        npmCheckStub,
        npmInstallStub,
        npmFetchPeerDependenciesStub,
        init;

    const log = {
        info: sinon.spy(),
        error: sinon.spy()
    };
    const requireStubs = {
        "../logging": log
    };

    /**
     * Returns the path inside of the fixture directory.
     * @returns {string} The path inside the fixture directory.
     * @private
     */
    function getFixturePath() {
        const args = Array.prototype.slice.call(arguments);

        args.unshift(fixtureDir);
        let filepath = path.join.apply(path, args);

        try {
            filepath = fs.realpathSync(filepath);
            return filepath;
        } catch (e) {
            return filepath;
        }
    }

    // copy into clean area so as not to get "infected" by this project's .eslintrc files
    before(() => {
        fixtureDir = `${os.tmpdir()}/eslint/fixtures/config-initializer`;
        sh.mkdir("-p", fixtureDir);
        sh.cp("-r", "./tests/fixtures/config-initializer/.", fixtureDir);
        fixtureDir = fs.realpathSync(fixtureDir);
    });

    beforeEach(() => {
        npmInstallStub = sinon.stub(npmUtil, "installSyncSaveDev");
        npmCheckStub = sinon.stub(npmUtil, "checkDevDeps").callsFake(packages => packages.reduce((status, pkg) => {
            status[pkg] = false;
            return status;
        }, {}));
        npmFetchPeerDependenciesStub = sinon
            .stub(npmUtil, "fetchPeerDependencies")
            .returns({
                eslint: "^3.19.0",
                "eslint-plugin-jsx-a11y": "^5.0.1",
                "eslint-plugin-import": "^2.2.0",
                "eslint-plugin-react": "^7.0.1"
            });
        init = proxyquire("../../../lib/config/config-initializer", requireStubs);
    });

    afterEach(() => {
        log.info.reset();
        log.error.reset();
        npmInstallStub.restore();
        npmCheckStub.restore();
        npmFetchPeerDependenciesStub.restore();
    });

    after(() => {
        sh.rm("-r", fixtureDir);
    });

    describe("processAnswers()", () => {

        describe("prompt", () => {

            beforeEach(() => {
                answers = {
                    source: "prompt",
                    extendDefault: true,
                    indent: 2,
                    quotes: "single",
                    linebreak: "unix",
                    semi: true,
                    es6: true,
                    modules: true,
                    env: ["browser"],
                    jsx: false,
                    react: false,
                    format: "JSON",
                    commonjs: false
                };
            });

            it("should create default config", () => {
                const config = init.processAnswers(answers);

                assert.deepEqual(config.rules.indent, ["error", 2]);
                assert.deepEqual(config.rules.quotes, ["error", "single"]);
                assert.deepEqual(config.rules["linebreak-style"], ["error", "unix"]);
                assert.deepEqual(config.rules.semi, ["error", "always"]);
                assert.equal(config.env.es6, true);
                assert.equal(config.parserOptions.sourceType, "module");
                assert.equal(config.env.browser, true);
                assert.equal(config.extends, "eslint:recommended");
            });

            it("should disable semi", () => {
                answers.semi = false;
                const config = init.processAnswers(answers);

                assert.deepEqual(config.rules.semi, ["error", "never"]);
            });

            it("should enable jsx flag", () => {
                answers.jsx = true;
                const config = init.processAnswers(answers);

                assert.equal(config.parserOptions.ecmaFeatures.jsx, true);
            });

            it("should enable react plugin", () => {
                answers.jsx = true;
                answers.react = true;
                const config = init.processAnswers(answers);

                assert.equal(config.parserOptions.ecmaFeatures.jsx, true);
                assert.equal(config.parserOptions.ecmaFeatures.experimentalObjectRestSpread, true);
                assert.deepEqual(config.plugins, ["react"]);
            });

            it("should not enable es6", () => {
                answers.es6 = false;
                const config = init.processAnswers(answers);

                assert.isUndefined(config.env.es6);
            });

            it("should extend eslint:recommended", () => {
                const config = init.processAnswers(answers);

                assert.equal(config.extends, "eslint:recommended");
            });

            it("should not use commonjs by default", () => {
                const config = init.processAnswers(answers);

                assert.isUndefined(config.env.commonjs);
            });

            it("should use commonjs when set", () => {
                answers.commonjs = true;
                const config = init.processAnswers(answers);

                assert.isTrue(config.env.commonjs);
            });
        });

        describe("guide", () => {
            it("should support the google style guide", () => {
                const config = init.getConfigForStyleGuide("google");

                assert.deepEqual(config, { extends: "google", installedESLint: true });
            });

            it("should support the airbnb style guide", () => {
                const config = init.getConfigForStyleGuide("airbnb");

                assert.deepEqual(config, { extends: "airbnb", installedESLint: true });
            });

            it("should support the airbnb base style guide", () => {
                const config = init.getConfigForStyleGuide("airbnb-base");

                assert.deepEqual(config, { extends: "airbnb-base", installedESLint: true });
            });

            it("should support the standard style guide", () => {
                const config = init.getConfigForStyleGuide("standard");

                assert.deepEqual(config, { extends: "standard", installedESLint: true });
            });

            it("should throw when encountering an unsupported style guide", () => {
                assert.throws(() => {
                    init.getConfigForStyleGuide("non-standard");
                }, "You referenced an unsupported guide.");
            });

            it("should install required sharable config", () => {
                init.getConfigForStyleGuide("google");
                assert(npmInstallStub.calledOnce);
                assert(npmInstallStub.firstCall.args[0].some(name => name.startsWith("eslint-config-google@")));
            });

            it("should install ESLint if not installed locally", () => {
                init.getConfigForStyleGuide("google");
                assert(npmInstallStub.calledOnce);
                assert(npmInstallStub.firstCall.args[0].some(name => name.startsWith("eslint@")));
            });

            it("should install peerDependencies of the sharable config", () => {
                init.getConfigForStyleGuide("airbnb");

                assert(npmFetchPeerDependenciesStub.calledOnce);
                assert(npmFetchPeerDependenciesStub.firstCall.args[0] === "eslint-config-airbnb@latest");
                assert(npmInstallStub.calledOnce);
                assert.deepEqual(
                    npmInstallStub.firstCall.args[0],
                    [
                        "eslint-config-airbnb@latest",
                        "eslint@^3.19.0",
                        "eslint-plugin-jsx-a11y@^5.0.1",
                        "eslint-plugin-import@^2.2.0",
                        "eslint-plugin-react@^7.0.1"
                    ]
                );
            });
        });

        describe("auto", () => {
            const completeSpy = sinon.spy();
            let config;

            before(() => {
                const patterns = [
                    getFixturePath("lib"),
                    getFixturePath("tests")
                ].join(" ");

                answers = {
                    source: "auto",
                    patterns,
                    es6: false,
                    env: ["browser"],
                    jsx: false,
                    react: false,
                    format: "JSON",
                    commonjs: false
                };

                const sandbox = sinon.sandbox.create();

                sandbox.stub(console, "log"); // necessary to replace, because of progress bar

                process.chdir(fixtureDir);

                try {
                    config = init.processAnswers(answers);
                    process.chdir(originalDir);
                } catch (err) {

                    // if processAnswers crashes, we need to be sure to restore cwd
                    process.chdir(originalDir);
                    throw err;
                } finally {
                    sandbox.restore(); // restore console.log()
                }
            });

            it("should create a config", () => {
                assert.isTrue(completeSpy.notCalled);
                assert.ok(config);
            });

            it("should create the config based on examined files", () => {
                assert.deepEqual(config.rules.quotes, ["error", "double"]);
                assert.equal(config.rules.semi, "off");
            });

            it("should extend and not disable recommended rules", () => {
                assert.equal(config.extends, "eslint:recommended");
                assert.notProperty(config.rules, "no-console");
            });

            it("should throw on fatal parsing error", () => {
                const filename = getFixturePath("parse-error");

                sinon.stub(autoconfig, "extendFromRecommended");
                answers.patterns = filename;
                process.chdir(fixtureDir);
                assert.throws(() => {
                    config = init.processAnswers(answers);
                }, "Parsing error: Unexpected token ;");
                process.chdir(originalDir);
                autoconfig.extendFromRecommended.restore();
            });

            it("should throw if no files are matched from patterns", () => {
                sinon.stub(autoconfig, "extendFromRecommended");
                answers.patterns = "not-a-real-filename";
                process.chdir(fixtureDir);
                assert.throws(() => {
                    config = init.processAnswers(answers);
                }, "Automatic Configuration failed.  No files were able to be parsed.");
                process.chdir(originalDir);
                autoconfig.extendFromRecommended.restore();
            });
        });
    });
});
