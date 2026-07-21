[CmdletBinding()]
param(
    [string] $JavaHome = (Join-Path $PSScriptRoot 'runtime\jdk-21'),

    [string] $MavenHome = (Join-Path $PSScriptRoot 'runtime\apache-maven-3.9.12'),

    [switch] $SkipTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 7) {
    throw 'This script requires PowerShell 7 or newer.'
}

$javaHomePath = [IO.Path]::GetFullPath($JavaHome)
$mavenHomePath = [IO.Path]::GetFullPath($MavenHome)
$java = Join-Path $javaHomePath 'bin\java.exe'
$maven = Join-Path $mavenHomePath 'bin\mvn.cmd'
$pom = Join-Path $PSScriptRoot 'replay-parser\pom.xml'

if (-not (Test-Path -LiteralPath $java -PathType Leaf)) {
    throw "Java 21 was not found at $java"
}
if (-not (Test-Path -LiteralPath $maven -PathType Leaf)) {
    throw "Maven was not found at $maven"
}

$previousJavaHome = $env:JAVA_HOME
try {
    $env:JAVA_HOME = $javaHomePath
    $arguments = @('-f', $pom, 'clean', 'package')
    if ($SkipTests) {
        $arguments += '-DskipTests'
    }

    & $maven @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Parser build failed with Maven exit code $LASTEXITCODE"
    }
} finally {
    $env:JAVA_HOME = $previousJavaHome
}

$jar = Join-Path $PSScriptRoot 'replay-parser\target\stats-0.1.0.jar'
if (-not (Test-Path -LiteralPath $jar -PathType Leaf)) {
    throw "Build completed without the expected shaded JAR: $jar"
}

Write-Host "Parser JAR: $jar"
