package opendota;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

public final class ReplayCli {
    private ReplayCli() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 2) {
            System.err.println("Usage: ReplayCli <match.dem> <raw.jsonl>");
            System.exit(2);
        }
        Path replay = Path.of(args[0]);
        Path output = Path.of(args[1]);
        Path parent = output.toAbsolutePath().getParent();
        if (parent != null) Files.createDirectories(parent);
        try (InputStream input = new BufferedInputStream(Files.newInputStream(replay));
                OutputStream target = new BufferedOutputStream(Files.newOutputStream(output))) {
            new Parse(input, target, false);
        }
        System.out.println(output.toAbsolutePath());
    }
}
