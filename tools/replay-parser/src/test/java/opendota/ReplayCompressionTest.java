package opendota;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream;
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorOutputStream;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ReplayCompressionTest {
    @TempDir
    Path temporaryDirectory;

    @Test
    void detectsReplayContentByMagicBytesInsteadOfTheFileExtension() throws Exception {
        Path dem = write("raw.dem.bz2", "PBDEMS2-replay".getBytes(StandardCharsets.US_ASCII));
        Path bzip2 = write("bzip2.dem.bz2", compressBzip2("PBDEMS2-bzip2"));
        Path zstandard = write("zstd.dem.bz2", compressZstandard("PBDEMS2-zstandard"));
        Path unknown = write("unknown.dem.bz2", "<html>upstream error</html>".getBytes(StandardCharsets.UTF_8));

        assertEquals(ReplayCompression.Format.DEM, ReplayCompression.detect(dem));
        assertEquals(ReplayCompression.Format.BZIP2, ReplayCompression.detect(bzip2));
        assertEquals(ReplayCompression.Format.ZSTANDARD, ReplayCompression.detect(zstandard));
        assertEquals(ReplayCompression.Format.UNKNOWN, ReplayCompression.detect(unknown));
    }

    @Test
    void decompressesTraditionalBzip2AndValveZstandardFrames() throws Exception {
        assertDecompresses("PBDEMS2-bzip2", compressBzip2("PBDEMS2-bzip2"),
                ReplayCompression.Format.BZIP2);
        assertDecompresses("PBDEMS2-zstandard", compressZstandard("PBDEMS2-zstandard"),
                ReplayCompression.Format.ZSTANDARD);
    }

    @Test
    void decompressesOptionalRealReplayFixtureToAValidDemHeader() throws Exception {
        String fixture = System.getProperty("dotaLens.replayFixture", "");
        Assumptions.assumeTrue(!fixture.isBlank(), "No real Replay fixture was provided");
        Path replay = Path.of(fixture);

        ReplayCompression.Format format = ReplayCompression.detect(replay);
        assertEquals(ReplayCompression.Format.ZSTANDARD, format);
        try (InputStream input = ReplayCompression.openDecompressing(
                Files.newInputStream(replay), format)) {
            assertArrayEquals("PBDEMS2".getBytes(StandardCharsets.US_ASCII), input.readNBytes(7));
        }
    }

    private Path write(String name, byte[] value) throws Exception {
        Path path = temporaryDirectory.resolve(name);
        Files.write(path, value);
        return path;
    }

    private static byte[] compressBzip2(String value) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (BZip2CompressorOutputStream compressed = new BZip2CompressorOutputStream(output)) {
            compressed.write(value.getBytes(StandardCharsets.US_ASCII));
        }
        return output.toByteArray();
    }

    private static byte[] compressZstandard(String value) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ZstdCompressorOutputStream compressed = new ZstdCompressorOutputStream(output)) {
            compressed.write(value.getBytes(StandardCharsets.US_ASCII));
        }
        return output.toByteArray();
    }

    private static void assertDecompresses(String expected, byte[] compressed,
            ReplayCompression.Format format) throws Exception {
        try (InputStream input = ReplayCompression.openDecompressing(
                new ByteArrayInputStream(compressed), format)) {
            assertArrayEquals(expected.getBytes(StandardCharsets.US_ASCII), input.readAllBytes());
        }
    }
}
