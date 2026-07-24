package opendota;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;

import org.junit.jupiter.api.Test;

class TunedGzipOutputStreamTest {
    @Test
    void writesStandardGzipPayload() throws Exception {
        byte[] source = "Dota Lens replay archive".repeat(256).getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream compressed = new ByteArrayOutputStream();
        try (TunedGzipOutputStream output = new TunedGzipOutputStream(compressed, 4096)) {
            output.write(source);
        }

        byte[] restored;
        try (GZIPInputStream input = new GZIPInputStream(
                new ByteArrayInputStream(compressed.toByteArray()))) {
            restored = input.readAllBytes();
        }
        assertArrayEquals(source, restored);
    }
}
