package opendota;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HexFormat;

import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream;
import org.apache.commons.compress.compressors.zstandard.ZstdCompressorInputStream;

final class ReplayCompression {
    enum Format {
        DEM,
        BZIP2,
        ZSTANDARD,
        UNKNOWN
    }

    private static final byte[] ZSTANDARD_MAGIC = {
            (byte) 0x28, (byte) 0xB5, (byte) 0x2F, (byte) 0xFD
    };

    private ReplayCompression() {
    }

    static Format detect(Path path) throws IOException {
        if (!Files.isRegularFile(path) || Files.size(path) == 0) return Format.UNKNOWN;
        byte[] header;
        try (InputStream input = Files.newInputStream(path)) {
            header = input.readNBytes(7);
        }
        if (startsWith(header, "PBDEMS2".getBytes(StandardCharsets.US_ASCII))) return Format.DEM;
        if (startsWith(header, "BZh".getBytes(StandardCharsets.US_ASCII))) return Format.BZIP2;
        if (startsWith(header, ZSTANDARD_MAGIC)) return Format.ZSTANDARD;
        return Format.UNKNOWN;
    }

    static boolean isCompressed(Format format) {
        return format == Format.BZIP2 || format == Format.ZSTANDARD;
    }

    static InputStream openDecompressing(InputStream input, Format format) throws IOException {
        return switch (format) {
            case BZIP2 -> new BZip2CompressorInputStream(input, true);
            case ZSTANDARD -> new ZstdCompressorInputStream(input);
            default -> throw new IOException("Replay payload is not a supported compressed archive: " + format);
        };
    }

    static String signature(Path path) throws IOException {
        byte[] header;
        try (InputStream input = Files.newInputStream(path)) {
            header = input.readNBytes(8);
        }
        return HexFormat.ofDelimiter(" ").withUpperCase().formatHex(header);
    }

    private static boolean startsWith(byte[] value, byte[] prefix) {
        if (value.length < prefix.length) return false;
        for (int index = 0; index < prefix.length; index++) {
            if (value[index] != prefix[index]) return false;
        }
        return true;
    }
}
