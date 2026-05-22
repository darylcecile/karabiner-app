import KarabinerCore
import Testing

struct KarabinerCoreSmokeTests {
    @Test
    func coreModuleIdentityIsStable() {
        #expect(KarabinerCoreModule.name == "KarabinerCore")
    }
}
