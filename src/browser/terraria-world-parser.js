import terrariaFileParser from "./utils/terraria-file-parser.js";
import TerrariaWorldParserError from "./utils/terraria-world-parser-error.js";

export default class terrariaWorldParser extends terrariaFileParser {
    constructor() {
        super();
    }

    async loadFile(file) {
        try {
            await super.loadFile(file);
        } catch(e) {
            throw new TerrariaWorldParserError("Problem with loading the file", e);
        }

        return this;
    }

    parse(options) {
        const sections = {
            fileFormatHeader:       this.parseFileFormatHeader,
            header:                 this.parseHeader,
            tiles:                  this.parseWorldTiles,
            chests:                 this.parseChests,
            signs:                  this.parseSigns,
            NPCs:                   this.parseNPCs,
            tileEntities:           this.parseTileEntities,
            weightedPressurePlates: this.parseWeightedPressurePlates,
            rooms:                  this.parseTownManager,
            bestiary:               this.parseBestiary,
            creativePowers:         this.parseCreativePowers,
            footer:                 this.parseFooter
        }

        this.options = {
            ...this.options,
            sections: Object.keys(sections),
            progressCallback: undefined,
            ignorePointers: false,
            ...options,
        };
        this.options.sections = this.options.sections.map(section => section.toLowerCase());

        if (this.options.progressCallback) {
            const onePercentSize = Math.floor(this.buffer.byteLength / 100);
            let nextPercentSize = onePercentSize;
            let percent = 0;

            let _offset = this.offset;
            Object.defineProperty(this, "offset", {
                get: () => _offset,
                set: (value) => {
                    _offset = value;
                    if (_offset >= nextPercentSize){
                        percent++;
                        nextPercentSize += onePercentSize;
                        this.options.progressCallback(percent);
                    }
                }
            });
        }

        let data = {};

        try {
            this.world = this.parseNecessaryData();
            if (this.options.sections.includes("necessary"))
                data.necessary = this.world;

            if (this.world.version < 225) {
                delete sections.bestiary;
                delete sections.creativePowers;
            }

            for (let [sectionName, parseFunction] of Object.entries(sections)) {
                if (this.options.sections.includes( sectionName.toLowerCase() )) {
                    const sectionIndex = Object.keys(sections).indexOf(sectionName);

                    this.offset = this.world.pointers[sectionIndex];
                    data[sectionName] = parseFunction.call(this);

                    if (!this.options.ignorePointers && this.offset != this.world.pointers[sectionIndex + 1] && this.offset != this.buffer.byteLength)
                        throw new Error("Bad " + sectionName + " section end offset");
                }
            }
        } catch(e) {
            throw new TerrariaWorldParserError("Problem with parsing the file", e);
        }

        return data;
    }

    parseNecessaryData() {
        let version, magicNumber, fileType, pointers, importants, height, width;
        let isAndroid = false;

        this.offset = 0;

        try {
            version = this.readInt32();
            magicNumber = this.readString(7);
            fileType = this.readUInt8();
            this.skipBytes(12);
            pointers = [0];
            for (let i = this.readInt16(); i > 0; i--)
                pointers.push(this.readInt32());
            importants = this.parseBitsByte(this.readInt16());
            this.readString();
            this.readString();
            this.skipBytes(44);
            height = this.readInt32();
            width = this.readInt32();
        } catch(e) {
            throw new Error("Invalid file type");
        }

        this.offset = 0;

        if ((magicNumber != "relogic" && magicNumber != "xindong") || fileType != 2)
            throw new Error("Invalid file type");

        if ( magicNumber == "xindong") {
            isAndroid = true;
        }

        if (version < 194)
            throw new Error("Map version is older than 1.3.5.3 and cannot be parsed");

        return {
            version,
            pointers,
            importants,
            width,
            height,
            isAndroid
        };
    }

    parseFileFormatHeader() {
        let data = {};

        data.version        = this.readInt32();
        data.magicNumber    = this.readString(7);
        data.fileType       = this.readUInt8();
        data.revision       = this.readUInt32();
        data.favorite       = this.readBoolean();
        this.skipBytes(7);
        data.pointers       = [];
        for (let i = this.readInt16(); i > 0; i--)
            data.pointers.push(this.readInt32());
        data.importants     = this.parseBitsByte(this.readInt16());

        if (data.magicNumber == "xindong") {
            data.isAndroid = true;
        }
        return data;
    }

    parseHeader() {
        let data = {};

        data.mapName                = this.readString();
        if (this.world.version >= 179) {
          if (this.world.version == 179) {
            data.seedText               = this.readInt32();
          } else {
            data.seedText               = this.readString();
          }
          data.worldGeneratorVersion  = this.readBytes(8);
        }
        if (this.world.version >= 181) {
          data.guid                   = this.readBytes(16);
        }
        data.guidString             = this.parseGuid(data.guid);
        data.worldId                = this.readInt32();
        data.leftWorld              = this.readInt32();
        data.rightWorld             = this.readInt32();
        data.topWorld               = this.readInt32();
        data.bottomWorld            = this.readInt32();
        data.maxTilesY              = this.readInt32();
        data.maxTilesX              = this.readInt32();

        if (this.world.version >= 209) {
            data.gameMode           = this.readInt32();
          if (this.world.version >= 222) {
            data.drunkWorld         = this.readBoolean();
          }

            if (this.world.version >= 227)
                data.getGoodWorld   = this.readBoolean();
            if (this.world.version >= 238)
                data.getTenthAnniversaryWorld = this.readBoolean();
            if (this.world.version >= 239)
                data.dontStarveWorld = this.readBoolean();
            if (this.world.version >= 241)
                data.notTheBeesWorld = this.readBoolean();
        } else if (this.world.version == 208) {
            data.masterMode         = this.readBoolean();
        } else if (this.world.version >= 112) {
            data.expertMode         = this.readBoolean();
        }


        if (this.world.version >= 141) {
          data.creationTime           = this.readBytes(8);
        }

        data.moonType               = this.readUInt8();

        data.treeX = [];
        data.treeX[0]               = this.readInt32();
        data.treeX[1]               = this.readInt32();
        data.treeX[2]               = this.readInt32();

        data.treeStyle = [];
        data.treeStyle[0]           = this.readInt32();
        data.treeStyle[1]           = this.readInt32();
        data.treeStyle[2]           = this.readInt32();
        data.treeStyle[3]           = this.readInt32();

        data.caveBackX = [];
        data.caveBackX[0]           = this.readInt32();
        data.caveBackX[1]           = this.readInt32();
        data.caveBackX[2]           = this.readInt32();

        data.caveBackStyle = [];
        data.caveBackStyle[0]       = this.readInt32();
        data.caveBackStyle[1]       = this.readInt32();
        data.caveBackStyle[2]       = this.readInt32();
        data.caveBackStyle[3]       = this.readInt32();

        data.iceBackStyle           = this.readInt32();
        data.jungleBackStyle        = this.readInt32();
        data.hellBackStyle          = this.readInt32();
        data.spawnTileX             = this.readInt32();
        data.spawnTileY             = this.readInt32();
        data.worldSurface           = this.readFloat64();
        data.rockLayer              = this.readFloat64();
        data.tempTime               = this.readFloat64();
        data.tempDayTime            = this.readBoolean();
        data.tempMoonPhase          = this.readInt32();
        data.tempBloodMoon          = this.readBoolean();
        data.tempEclipse            = this.readBoolean();
        data.dungeonX               = this.readInt32();
        data.dungeonY               = this.readInt32();
        data.crimson                = this.readBoolean();
        data.downedBoss1            = this.readBoolean();
        data.downedBoss2            = this.readBoolean();
        data.downedBoss3            = this.readBoolean();
        data.downedQueenBee         = this.readBoolean();
        data.downedMechBoss1        = this.readBoolean();
        data.downedMechBoss2        = this.readBoolean();
        data.downedMechBoss3        = this.readBoolean();
        data.downedMechBossAny      = this.readBoolean();
        data.downedPlantBoss        = this.readBoolean();
        data.downedGolemBoss        = this.readBoolean();
        if (this.world.version >= 118) {
            data.downedSlimeKing        = this.readBoolean();
        }
        data.savedGoblin            = this.readBoolean();
        data.savedWizard            = this.readBoolean();
        data.savedMech              = this.readBoolean();
        data.downedGoblins          = this.readBoolean();
        data.downedClown            = this.readBoolean();
        data.downedFrost            = this.readBoolean();
        data.downedPirates          = this.readBoolean();
        data.shadowOrbSmashed       = this.readBoolean();
        data.spawnMeteor            = this.readBoolean();
        data.shadowOrbCount         = this.readUInt8();
        data.altarCount             = this.readInt32();
        data.hardMode               = this.readBoolean();
        data.invasionDelay          = this.readInt32();
        data.invasionSize           = this.readInt32();
        data.invasionType           = this.readInt32();
        data.invasionX              = this.readFloat64();
        if (this.world.version >= 118) {
            data.slimeRainTime          = this.readFloat64();
        }
        if (this.world.version >= 113) {
            data.sundialCooldown        = this.readUInt8();
        }
        data.tempRaining            = this.readBoolean();
        data.tempRainTime           = this.readInt32();
        data.tempMaxRain            = this.readFloat32();
        data.oreTier1               = this.readInt32();
        data.oreTier2               = this.readInt32();
        data.oreTier3               = this.readInt32();
        data.setBGTree                 = this.readUInt8();
        data.setBGCorruption                 = this.readUInt8();
        data.setBGJungle                 = this.readUInt8();
        data.setBGSnow                 = this.readUInt8();
        data.setBGHallow                 = this.readUInt8();
        data.setBGCrimson                 = this.readUInt8();
        data.setBGDesert                 = this.readUInt8();
        data.setBGOcean                 = this.readUInt8();
        data.cloudBGActive          = this.readInt32();
        data.numClouds              = this.readInt16();
        data.windSpeed              = this.readFloat32();

        if (this.world.version < 95) {
            return data;
        }


        data.anglerWhoFinishedToday = [];
        for (let i = this.readInt32(); i > 0; --i)
            data.anglerWhoFinishedToday.push(this.readString());

        if (this.world.version < 95) {
            return data;
        }

        data.savedAngler            = this.readBoolean();

        if (this.world.version < 101) {
            return data;
        }

        data.anglerQuest            = this.readInt32();

        if (this.world.version < 104) {
            return data;
        }

        if (this.world.version > 104)
          data.savedStylist           = this.readBoolean();
        if (this.world.version >= 129)
          data.savedTaxCollector      = this.readBoolean();
        if (this.world.version >= 201)
            data.savedGolfer        = this.readBoolean();

        if (this.world.version >= 107)
          data.invasionSizeStart      = this.readInt32();
        if (this.world.version >= 108)
          data.tempCultistDelay       = this.readInt32();

        if (this.world.version < 109) {
            return data;
        }

        data.killCount = [];
        for (let i = this.readInt16(); i > 0; i--)
            data.killCount.push(this.readInt32());

        if (this.world.version < 109) {
            return data;
        }

        if (this.world.version >= 140) {
          data.fastForwardTime  = this.readBoolean();
        }

        if (this.world.version < 131) {
            return data;
        }

        data.downedFishron          = this.readBoolean();
        if (this.world.version >= 140) {
            data.downedMartians         = this.readBoolean();
            data.downedAncientCultist   = this.readBoolean();
            data.downedMoonlord         = this.readBoolean();
        }

        data.downedHalloweenKing    = this.readBoolean();
        data.downedHalloweenTree    = this.readBoolean();
        data.downedChristmasIceQueen = this.readBoolean();

        if (this.world.version < 140) {
            return data;
        }

        data.downedChristmasSantank = this.readBoolean();
        data.downedChristmasTree    = this.readBoolean();

        if (this.world.version >= 140) {
            data.downedTowerSolar       = this.readBoolean();
            data.downedTowerVortex      = this.readBoolean();
            data.downedTowerNebula      = this.readBoolean();
            data.downedTowerStardust    = this.readBoolean();
            data.TowerActiveSolar       = this.readBoolean();
            data.TowerActiveVortex      = this.readBoolean();
            data.TowerActiveNebula      = this.readBoolean();
            data.TowerActiveStardust    = this.readBoolean();
            data.LunarApocalypseIsUp    = this.readBoolean();
        }

        if (this.world.version >= 170) {
            data.tempPartyManual        = this.readBoolean();
            data.tempPartyGenuine       = this.readBoolean();
            data.tempPartyCooldown      = this.readInt32();

            data.tempPartyCelebratingNPCs = [];
            for (let i = this.readInt32(); i > 0; i--)
                data.tempPartyCelebratingNPCs.push(this.readInt32());
        }

        if (this.world.version >= 174) {
            data.Temp_Sandstorm_Happening       = this.readBoolean();
            data.Temp_Sandstorm_TimeLeft        = this.readInt32();
            data.Temp_Sandstorm_Severity        = this.readFloat32();
            data.Temp_Sandstorm_IntendedSeverity = this.readFloat32();
        }
        if (this.world.version >= 178) {
            data.savedBartender                 = this.readBoolean();
            data.DD2Event_DownedInvasionT1      = this.readBoolean();
            data.DD2Event_DownedInvasionT2      = this.readBoolean();
            data.DD2Event_DownedInvasionT3      = this.readBoolean();
        }

        if (this.world.version >= 194) 
            data.setBGMushroom = this.readUInt8();
        if (this.world.version >= 215) 
            data.setBGUnderworld = this.readUInt8();

        if (this.world.version >= 195) {
            data.setBGTree2 = this.readUInt8();
            data.setBGTree3 = this.readUInt8();
            data.setBGTree4 = this.readUInt8();
        }

        if (this.world.version >= 204) {
            data.combatBookWasUsed = this.readBoolean();
        }
        if (this.world.version >= 207) {
            data.lanternNightCooldown = this.readInt32();
            data.lanternNightGenuine = this.readBoolean();
            data.lanternNightManual = this.readBoolean();
            data.lanternNightNextNightIsGenuine = this.readBoolean();
        }

        if (this.world.version >= 211) {
            data.treeTopsVariations = [];
            for (let i = this.readInt32(); i > 0; i--)
                data.treeTopsVariations.push(this.readInt32());
        }
        if (this.world.version >= 212) {
            data.forceHalloweenForToday = this.readBoolean();
            data.forceXMasForToday = this.readBoolean();
        }
        if (this.world.version >= 216) {
            data.savedOreTierCopper = this.readInt32();
            data.savedOreTierIron = this.readInt32();
            data.savedOreTierSilver = this.readInt32();
            data.savedOreTierGold = this.readInt32();
        }

        if (this.world.version >= 217) {
            data.boughtCat = this.readBoolean();
            data.boughtDog = this.readBoolean();
            data.boughtBunny = this.readBoolean();
        }

        if (this.world.version >= 223) {
            data.downedEmpressOfLight = this.readBoolean();
            data.downedQueenSlime = this.readBoolean();
        }

        if (this.world.version >= 240) {
            data.downedDeerclops = this.readBoolean();
        }

        if (this.world.version >= 250) {
            data.unlockedSlimeBlueSpawn = this.readBoolean();
        }

        if (this.world.version >= 251) {
            data.unlockedMerchantSpawn = this.readBoolean();
            data.unlockedDemolitionistSpawn = this.readBoolean();
            data.unlockedPartyGirlSpawn = this.readBoolean();
            data.unlockedDyeTraderSpawn = this.readBoolean();
            data.unlockedTruffleSpawn = this.readBoolean();
            data.unlockedArmsDealerSpawn = this.readBoolean();
            data.unlockedNurseSpawn = this.readBoolean();
            data.unlockedPrincessSpawn = this.readBoolean();
        }

        if (this.world.version >= 259) {
            data.combatBookVolumeTwoWasUsed = this.readBoolean();
        }

        if (this.world.version >= 260) {
            data.peddlersSatchelWasUsed = this.readBoolean();
        }

        if (this.world.version >= 261) {
            data.unlockedSlimeGreenSpawn = this.readBoolean();
            data.unlockedSlimeOldSpawn = this.readBoolean();
            data.unlockedSlimePurpleSpawn = this.readBoolean();
            data.unlockedSlimeRainbowSpawn = this.readBoolean();
            data.unlockedSlimeRedSpawn = this.readBoolean();
            data.unlockedSlimeYellowSpawn = this.readBoolean();
            data.unlockedSlimeCopperSpawn = this.readBoolean();
        }

        if (this.world.version >= 264) {
            data.fastForwardTimeToDusk = this.readBoolean();
            data.moondialCooldown = this.readUInt8();
        }

        return data;
    }

    parseWorldTiles() {
        let data;
        this.RLE = 0;

        data = new Array(this.world.width);
        for (let x = 0; x < this.world.width; x++) {
            data[x] = new Array(this.world.height);
            for (let y = 0; y < this.world.height; y++) {
                data[x][y] = this.parseTileData();

                while(this.RLE > 0) {
                    data[x][y+1] = data[x][y];
                    y++;
                    this.RLE--;
                }
            }
        }

        return data;
    }

    parseTileData() {
        let tile = {};

        const flags1 = this.readUInt8();
        let flags2, flags3, flags4;

        // flags2 present
        if (flags1 & 1) {
            flags2 = this.readUInt8();
        }

        // flags3 present
        if (flags2 & 1) {
                flags3 = this.readUInt8();
        }

        // flags4 present
        if (this.world.version >= 269 && (flags3 & 1)) {
                flags4 = this.readUInt8();
        }

        // contains block
        if (flags1 & 2) {
            // block id has 1 byte / 2 bytes
            if (flags1 & 32)
                tile.blockId = this.readUInt16();
            else
                tile.blockId = this.readUInt8();

            // important tile (animated, big sprite, more variants...)
            if (this.world.importants[tile.blockId]) {
                tile.frameX = this.readInt16();
                tile.frameY = this.readInt16();
                if (tile.blockId == 144)
                    tile.frameY = 0;
            }

            // painted block
            if (flags3 & 8)
                tile.blockColor = this.readUInt8();
        }

        // contains wall
        if (flags1 & 4) {
            tile.wallId = this.readUInt8();

            // painted wall
            if (flags3 & 16)
                tile.wallColor = this.readUInt8();
        }

        // liquid informations
        const liquidType = (flags1 & 24) >> 3;
        if (liquidType != 0) {
            tile.liquidAmount = this.readUInt8();
            switch (liquidType) {
                case 1: tile.liquidType = "water"; break;
                case 2: tile.liquidType = "lava"; break;
                case 3: tile.liquidType = "honey"; break;
            }

            if (this.world.version >= 269 && (flags3 & 0b10000000) === 0b10000000) {
                tile.liquidType = "shimmer";
            }
        }

        // flags2 has any other informations than flags3 presence
        if (flags2 > 1) {
            if (flags2 & 2)
                tile.wireRed = true;
            if (flags2 & 4)
                tile.wireBlue = true;
            if (flags2 & 8)
                tile.wireGreen = true;

            const slope = (flags2 & 112) >> 4;
            if (slope != 0)
                switch(slope) {
                    case 1: tile.slope = "half"; break;
                    case 2: tile.slope = "TR"; break;
                    case 3: tile.slope = "TL"; break;
                    case 4: tile.slope = "BR"; break;
                    case 5: tile.slope = "BL"; break;
                }
        }

        // flags3 has any informations
        if (flags3 > 0) {
            if (flags3 & 2)
                tile.actuator = true;
            if (flags3 & 4)
                tile.actuated = true;
            if (flags3 & 32)
                tile.wireYellow = true;
            if (this.world.version >= 222 && flags3 & 64)
                tile.wallId = (this.readUInt8() << 8) | tile.wallId; //adding another byte
        }

        if (this.world.version >= 269 && header4 > 1) {
            if ((flags4 & 2) === 2) tile.invisibleBlock = true;
            if ((flags4 & 4) === 4) tile.invisibleWall = true;
            if ((flags4 & 8) === 8) tile.fullBrightBlock = true;
            if ((flags4 & 16) === 16) tile.fullBrightWall = true;
        }
        
        switch ((flags1 & 192) >> 6) {
            case 1: this.RLE = this.readUInt8(); break;
            case 2: this.RLE = this.readInt16(); break;
        }

        return tile;
    }

    parseChests() {
        let data = [];

        const chestsCount = this.readInt16(); //use world.chests.length instead
        this.readInt16(); //chestsSpace = 40 - constant in all supported map version files

        for (let i = 0; i < chestsCount; i++) {
            data[i] = {
                position: {
                    x: this.readInt32(),
                    y: this.readInt32()
                },
                name: this.readString()
            }

            if (data[i].name == "")
                delete data[i].name;

            for (let j = 0, stack; j < 40; j++) {
                stack = this.readInt16();
                if (stack == 0)
                    continue;

                if (!data[i].items)
                    data[i].items = [];

                data[i].items[j] = {
                    stack,
                    id: this.readInt32(),
                    prefix: this.readUInt8()
                };
            }
        }

        return data;
    }

    parseSigns() {
        let data = [];

        const signsCount = this.readInt16(); //use world.signs.count instead
        for (let i = 0; i < signsCount; i++)
            data[i] = {
                text: this.readString(),
                position: {
                    x: this.readInt32(),
                    y: this.readInt32()
                }
            };

        return data;
    }

    parseNPCs() {
        let data = [];

        let i = 0;
        for (; this.readBoolean(); i++) {
            let id;
            if (this.world.version >= 190) {
                id = this.readInt32()
            } else {
                let npcNameId = this.readString();

                switch (npcNameId) {
                    case 'Merchant': id=17; break;
                    case 'Nurse': id=18; break;
                    case 'Arms Dealer': id=19; break;
                    case 'Dryad': id=20; break;
                    case 'Guide': id=22; break;
                    case 'Old Man': id=37; break;
                    case 'Demolitionist': id=38; break;
                    case 'Clothier': id=54; break;
                    case 'Bound Goblin': id=105; break;
                    case 'Bound Wizard': id=106; break;
                    case 'Goblin Tinkerer': id=107; break;
                    case 'Wizard': id=108; break;
                    case 'Bound Mechanic': id=123; break;
                    case 'Mechanic': id=124; break;
                    case 'Santa Claus': id=142; break;
                    case 'Truffle': id=160; break;
                    case 'Steampunker': id=178; break;
                    case 'Dye Trader': id=207; break;
                    case 'Party Girl': id=208; break;
                    case 'Cyborg': id=209; break;
                    case 'Painter': id=227; break;
                    case 'Witch Doctor': id=228; break;
                    case 'Pirate': id=229; break;
                    case 'Stylist': id=353; break;
                    case 'Webbed Stylist': id=354; break;
                    case 'Worm': id=357; break;
                    case 'Traveling Merchant': id=368; break;
                    case 'Angler': id=369; break;
                    case 'Sleeping Angler': id=376; break; 
                    case 'Grasshopper': id=377; break;
                    case 'Tax Collector': id=441; break;
                    case 'Gold Grasshopper': id=446; break;
                    case 'Gold Worm': id=448; break;
                    case 'Skeleton Merchant': id=453; break;
                    case 'Enchanted Nightcrawler': id=484; break;
                    case 'Grubby': id=485; break;
                    case 'Sluggy': id=486; break;
                    case 'Buggy': id=487; break;
                    case 'Eternia Crystal': id=548; break;
                    case 'Tavernkeep': id=550; break;
                    case 'Unconscious Man': id=579; break;
                    case 'Golfer': id=588; break;
                    case 'Maggot': id=606; break;
                    case 'Zoologist': id=633; break;
                    case 'Cat': id=637; break;
                    case 'Dog': id=638; break;
                    case 'Bunny': id=656; break;
                    case 'Princess': id=663; break;
                }
            }

            data[i] = {
                townNPC: true,
                id: id,
                name: this.readString(),
                position: {
                    x: this.readFloat32(),
                    y: this.readFloat32()
                },
                homeless: this.readBoolean(),
                homePosition: {
                    x: this.readInt32(),
                    y: this.readInt32()
                }
            };

            if (this.world.version >= 213 && this.parseBitsByte(1)[0])
                data[i].variationIndex = this.readInt32();
        }

        for (; this.readBoolean(); i++)
            data[i] = {
                pillar: true,
                id: this.readInt32(),
                position: {
                    x: this.readFloat32(),
                    y: this.readFloat32()
                }
            };

        return data;
    }

    parseTileEntities() {
        let data = [];

        const tileEntitiesCount = this.readInt32(); //use world.tileEntities.length instead
        for (let i = 0; i < tileEntitiesCount; i++ ) {
            data[i] = {
                type: this.readUInt8(),
                id: this.readInt32(),
                position: {
                    x: this.readInt16(),
                    y: this.readInt16()
                }
            };;

            switch (data[i].type) {
                //dummy
                case 0:
                    data[i].targetDummy = {
                        npc: this.readInt16()
                    };
                    break;
                //item frame
                case 1:
                    data[i].itemFrame = {
                        itemId: this.readInt16(),
                        prefix: this.readUInt8(),
                        stack: this.readInt16()
                    };
                    break;
                //logic sensor
                case 2:
                    data[i].logicSensor = {
                        logicCheck: this.readUInt8(),
                        on: this.readBoolean()
                    };
                    break;
                //display doll
                case 3:
                    data[i].displayDoll = {
                        items: [],
                        dyes: []
                    };

                    var items = this.parseBitsByte(8);
                    var dyes = this.parseBitsByte(8);

                    for (let j = 0; j < 8; j++)
                        if (items[j]) {
                            if (!data[i].displayDoll.items)
                                data[i].displayDoll.items = [];
                            data[i].displayDoll.items[j] = {
                                itemId: this.readInt16(),
                                prefix: this.readUInt8(),
                                stack: this.readInt16()
                            };
                        }
                    for (let j = 0; j < 8; j++)
                        if (dyes[j]) {
                            if (!data[i].displayDoll.dyes)
                                data[i].displayDoll.dyes = [];
                            data[i].displayDoll.dyes[j] = {
                                itemId: this.readInt16(),
                                prefix: this.readUInt8(),
                                stack: this.readInt16()
                            };
                        }

                    break;
                //weapons rack
                case 4:
                    data[i].weaponsRack = {
                        itemId: this.readInt16(),
                        prefix: this.readUInt8(),
                        stack : this.readInt16()
                    };
                    break;
                //hat rack
                case 5:
                    data[i].hatRack = {
                        items: [],
                        dyes: []
                    };

                    var items = this.parseBitsByte(4);
                    var dyes = items.splice(2, 4);

                    for (let j = 0; j < 2; j++)
                        if (items[j]) {
                            if (!data[i].hatRack.items)
                                data[i].hatRack.items = [];
                            data[i].hatRack.items[j] = {
                                itemId: this.readInt16(),
                                prefix: this.readUInt8(),
                                stack: this.readInt16()
                            };
                        }
                    for (let j = 0; j < 2; j++)
                        if (dyes[j]) {
                            if (!data[i].hatRack.dyes)
                                data[i].hatRack.dyes = [];
                            data[i].hatRack.dyes[j] = {
                                itemId: this.readInt16(),
                                prefix: this.readUInt8(),
                                stack: this.readInt16()
                            };
                        }

                    break;
                //food platter
                case 6:
                    data[i].foodPlatter = {
                        itemId: this.readInt16(),
                        prefix: this.readUInt8(),
                        stack : this.readInt16()
                    };
                    break;
                //teleportation pylon
                case 7:
                    data[i].teleportationPylon = true;
                    break;
            }
        }

        return data;
    }

    parseWeightedPressurePlates() {
        let data = [];

        const pressurePlatesCount = this.readInt32(); //use world.weightedPressurePlates.length instead
        for (let i = 0; i < pressurePlatesCount; i++)
            data[i] = {
                position: {
                    x: this.readInt32(),
                    y: this.readInt32()
                }
            };

        return data;
    }

    parseTownManager() {
        let data = [];

        const roomsCount = this.readInt32(); //use world.townManager.length
        for (let i = 0; i < roomsCount; i++)
            data[i] = {
                NPCId: this.readInt32(),
                position: {
                    x: this.readInt32(),
                    y: this.readInt32()
                }
            };

        return data;
    }

    parseBestiary() {
        let data = {};

        data.NPCKills = {};
        for (let i = this.readInt32(); i > 0; --i)
            data.NPCKills[ this.readString() ] = this.readInt32();

        data.NPCSights = [];
        for (let i = this.readInt32(); i > 0; --i)
            data.NPCSights.push(this.readString());

        data.NPCChats = [];
        for (let i = this.readInt32(); i > 0; --i)
            data.NPCChats.push(this.readString());

        return data;
    }

    parseCreativePowers() {
        let data = {};

        this.skipBytes(3);
        data.freezeTime = this.readBoolean();

        this.skipBytes(3);
        data.modifyTimeRate = this.readFloat32()

        this.skipBytes(3);
        data.freezeRainPower = this.readBoolean();

        this.skipBytes(3);
        data.freezeWindDirectionAndStrength = this.readBoolean();

        this.skipBytes(3);
        data.difficultySliderPower = this.readFloat32();

        this.skipBytes(3);
        data.stopBiomeSpreadPower = this.readBoolean();

        this.skipBytes(1);

        return data;
    }

    parseFooter() {
        return {
            signoff1: this.readBoolean(),
            signoff2: this.readString(),
            signoff3: this.readInt32()
        }
    }
}