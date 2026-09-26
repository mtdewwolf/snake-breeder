plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The game itself lives at the repository root (index.html, css/, js/). It is copied into the
// APK at build time so the app always ships exactly the same code as the browser version.
val gameRoot = rootDir.parentFile
val gameAssetsDir = layout.buildDirectory.dir("generated/gameAssets")

val syncGameAssets by tasks.registering(Sync::class) {
    description = "Copies the web game (index.html, css/, js/) into the app's assets."
    from(gameRoot) {
        include("index.html", "css/**", "js/**")
        into("game")
    }
    into(gameAssetsDir)
}

android {
    namespace = "com.mtdewwolf.snakebreeder"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mtdewwolf.snakebreeder"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Signed with the debug key so `assembleRelease` produces an installable APK out of the box.
            // Replace with your own signingConfig before publishing to Google Play.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    sourceSets["main"].assets.srcDir(gameAssetsDir)

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

tasks.named("preBuild") { dependsOn(syncGameAssets) }

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.13.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
}
