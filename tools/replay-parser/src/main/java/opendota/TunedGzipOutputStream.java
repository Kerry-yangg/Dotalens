package opendota;

import java.io.IOException;
import java.io.OutputStream;
import java.util.zip.Deflater;
import java.util.zip.GZIPOutputStream;

/** Favors interactive parse latency over the smallest possible JSON archive. */
final class TunedGzipOutputStream extends GZIPOutputStream {
    private static final int DEFAULT_COMPRESSION_LEVEL = 3;

    TunedGzipOutputStream(OutputStream output, int bufferSize) throws IOException {
        super(output, bufferSize);
        def.setLevel(compressionLevel());
    }

    private static int compressionLevel() {
        String configured = System.getenv("DOTA_LENS_GZIP_LEVEL");
        if (configured == null || configured.isBlank()) return DEFAULT_COMPRESSION_LEVEL;
        try {
            int level = Integer.parseInt(configured.trim());
            return level >= Deflater.NO_COMPRESSION && level <= Deflater.BEST_COMPRESSION
                    ? level : DEFAULT_COMPRESSION_LEVEL;
        } catch (NumberFormatException ignored) {
            return DEFAULT_COMPRESSION_LEVEL;
        }
    }
}
