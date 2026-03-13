/**
 * Demo scene generator — creates a synthetic MVR-like scene for testing
 * without needing a real .mvr file.
 *
 * Produces a simple concert stage layout:
 *   - 3 front-wash trusses (left, centre, right)
 *   - 1 rear beam truss
 *   - 8 moving head fixtures on the front trusses
 *   - 4 PAR fixtures on the rear truss
 */

import JSZip from 'jszip';

/** Returns an ArrayBuffer containing a synthetic .mvr ZIP archive */
export async function generateDemoMvr(): Promise<ArrayBuffer> {
  const zip = new JSZip();

  // Simple GDTF for a moving head (no actual 3D model — will use placeholder)
  const movingHeadGdtf = buildMovingHeadGdtf();
  const parGdtf = buildParGdtf();
  const trussGdtf = buildTrussGdtf();

  // Naming convention per DIN SPEC 15800: <Manufacturer>@<FixtureName>.gdtf
  // GDTFSpec references in MVR omit the .gdtf extension per DIN SPEC 15801
  zip.file('DemoCo@MovingHead.gdtf', movingHeadGdtf);
  zip.file('DemoCo@PARFixture.gdtf', parGdtf);
  zip.file('DemoTruss@Truss290.gdtf', trussGdtf);

  const xml = buildSceneXml();
  zip.file('GeneralSceneDescription.xml', xml);

  return zip.generateAsync({ type: 'arraybuffer', compression: 'STORE' });
}

// ─── Minimal GDTF XML builders ────────────────────────────────────────────────

function buildMovingHeadGdtf(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <FixtureType
    Name="Demo Moving Head"
    ShortName="DemoMH"
    LongName="Demo Moving Head 300W"
    Manufacturer="Demo Co"
    Description="Demo moving head for testing"
    FixtureTypeID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
    Thumbnail=""
    RefFT="">
    <AttributeDefinitions>
      <ActivationGroups/>
      <FeatureGroups>
        <FeatureGroup Name="Position" Pretty="Position">
          <Feature Name="PanTilt" Pretty="P/T"/>
        </FeatureGroup>
        <FeatureGroup Name="Gobo" Pretty="Gobo">
          <Feature Name="Gobo" Pretty="Gobo"/>
        </FeatureGroup>
        <FeatureGroup Name="Dimmer" Pretty="Dimmer">
          <Feature Name="Dimmer" Pretty="Dimmer"/>
        </FeatureGroup>
        <FeatureGroup Name="Color" Pretty="Colour">
          <Feature Name="Color" Pretty="Colour"/>
        </FeatureGroup>
        <FeatureGroup Name="Beam" Pretty="Beam">
          <Feature Name="Beam" Pretty="Beam"/>
        </FeatureGroup>
      </FeatureGroups>
      <Attributes>
        <Attribute Name="Pan" Pretty="Pan" ActivationGroup="" Feature="Position.PanTilt" PhysicalUnit="Angle"/>
        <Attribute Name="Tilt" Pretty="Tilt" ActivationGroup="" Feature="Position.PanTilt" PhysicalUnit="Angle"/>
        <Attribute Name="Dimmer" Pretty="Dim" ActivationGroup="" Feature="Dimmer.Dimmer" PhysicalUnit="Percent"/>
        <Attribute Name="ColorAdd_R" Pretty="R" ActivationGroup="" Feature="Color.Color" PhysicalUnit="None" Color="0.64,0.33,1.0"/>
        <Attribute Name="ColorAdd_G" Pretty="G" ActivationGroup="" Feature="Color.Color" PhysicalUnit="None" Color="0.3,0.6,1.0"/>
        <Attribute Name="ColorAdd_B" Pretty="B" ActivationGroup="" Feature="Color.Color" PhysicalUnit="None" Color="0.15,0.06,1.0"/>
      </Attributes>
    </AttributeDefinitions>
    <Models>
      <Model Name="Body" Length="0.28" Width="0.28" Height="0.42" PrimitiveType="Undefined" File=""/>
      <Model Name="Yoke" Length="0.28" Width="0.12" Height="0.35" PrimitiveType="Yoke" File=""/>
      <Model Name="Head" Length="0.25" Width="0.25" Height="0.25" PrimitiveType="Head" File=""/>
    </Models>
    <Geometries>
      <Geometry Name="Body" Model="Body" Matrix="{1,0,0}{0,1,0}{0,0,1}{0,0,0}">
        <Axis Name="Yoke" Model="Yoke" Matrix="{1,0,0}{0,1,0}{0,0,1}{0,0,420}">
          <Axis Name="Head" Model="Head" Matrix="{1,0,0}{0,1,0}{0,0,1}{0,0,350}">
            <Beam Name="Beam" Model="" Matrix="{1,0,0}{0,1,0}{0,0,1}{0,0,250}"
              BeamType="Spot"
              ColorTemperature="6500"
              FieldAngle="26"
              BeamAngle="20"
              Power="300"
              LuminousFlux="20000"
              LampType="Discharge">
            </Beam>
          </Axis>
        </Axis>
      </Geometry>
    </Geometries>
    <DMXModes>
      <DMXMode Name="Default" Geometry="Body">
        <DMXChannels>
          <DMXChannel DMXBreak="1" Offset="1" Highlight="None" Geometry="Yoke" InitialFunction="Pan.Pan.1">
            <LogicalChannel Attribute="Pan" Snap="No" Master="Grand" MibFade="0" DMXChangeTimeLimit="0">
              <ChannelFunction Attribute="Pan" Name="Pan" DMXFrom="0" Default="32767" PhysicalFrom="-270" PhysicalTo="270" RealFade="0" Wheel="" Emitter="" Filter="" ModeMaster="" ModeFrom="0" ModeTo="0"/>
            </LogicalChannel>
          </DMXChannel>
          <DMXChannel DMXBreak="1" Offset="3" Highlight="None" Geometry="Head" InitialFunction="Tilt.Tilt.1">
            <LogicalChannel Attribute="Tilt" Snap="No" Master="Grand" MibFade="0" DMXChangeTimeLimit="0">
              <ChannelFunction Attribute="Tilt" Name="Tilt" DMXFrom="0" Default="32767" PhysicalFrom="-135" PhysicalTo="135" RealFade="0" Wheel="" Emitter="" Filter="" ModeMaster="" ModeFrom="0" ModeTo="0"/>
            </LogicalChannel>
          </DMXChannel>
        </DMXChannels>
      </DMXMode>
    </DMXModes>
  </FixtureType>
</GDTF>`;
}

function buildParGdtf(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <FixtureType
    Name="Demo PAR LED"
    ShortName="DemoPAR"
    LongName="Demo PAR LED 100W"
    Manufacturer="Demo Co"
    Description="Demo PAR LED"
    FixtureTypeID="b2c3d4e5-f6a7-8901-bcde-f01234567891"
    Thumbnail=""
    RefFT="">
    <AttributeDefinitions>
      <ActivationGroups/>
      <FeatureGroups>
        <FeatureGroup Name="Dimmer" Pretty="Dimmer">
          <Feature Name="Dimmer" Pretty="Dimmer"/>
        </FeatureGroup>
        <FeatureGroup Name="Color" Pretty="Colour">
          <Feature Name="Color" Pretty="Colour"/>
        </FeatureGroup>
      </FeatureGroups>
      <Attributes>
        <Attribute Name="Dimmer" Pretty="Dim" ActivationGroup="" Feature="Dimmer.Dimmer" PhysicalUnit="Percent"/>
        <Attribute Name="ColorAdd_R" Pretty="R" ActivationGroup="" Feature="Color.Color" PhysicalUnit="None"/>
        <Attribute Name="ColorAdd_G" Pretty="G" ActivationGroup="" Feature="Color.Color" PhysicalUnit="None"/>
        <Attribute Name="ColorAdd_B" Pretty="B" ActivationGroup="" Feature="Color.Color" PhysicalUnit="None"/>
      </Attributes>
    </AttributeDefinitions>
    <Models>
      <Model Name="Body" Length="0.20" Width="0.20" Height="0.18" PrimitiveType="Conventional" File=""/>
    </Models>
    <Geometries>
      <Geometry Name="Body" Model="Body" Matrix="{1,0,0}{0,1,0}{0,0,1}{0,0,0}">
        <Beam Name="Beam" Model="" Matrix="{1,0,0}{0,1,0}{0,0,1}{0,0,180}"
          BeamType="Wash"
          ColorTemperature="3200"
          FieldAngle="45"
          BeamAngle="40"
          Power="100"
          LuminousFlux="5000">
        </Beam>
      </Geometry>
    </Geometries>
    <DMXModes>
      <DMXMode Name="Default" Geometry="Body">
        <DMXChannels>
          <DMXChannel DMXBreak="1" Offset="1" Geometry="Body">
            <LogicalChannel Attribute="Dimmer">
              <ChannelFunction Attribute="Dimmer" Name="Dimmer" DMXFrom="0" Default="0"/>
            </LogicalChannel>
          </DMXChannel>
        </DMXChannels>
      </DMXMode>
    </DMXModes>
  </FixtureType>
</GDTF>`;
}

function buildTrussGdtf(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GDTF DataVersion="1.2">
  <FixtureType
    Name="Square Truss 290mm"
    ShortName="Truss290"
    LongName="Square Box Truss 290mm"
    Manufacturer="Demo Truss Co"
    Description="Generic square box truss 290mm"
    FixtureTypeID="c3d4e5f6-a7b8-9012-cdef-012345678892"
    Thumbnail=""
    RefFT="">
    <AttributeDefinitions>
      <ActivationGroups/>
      <FeatureGroups/>
      <Attributes/>
    </AttributeDefinitions>
    <Models>
      <Model Name="Truss3m" Length="3.0" Width="0.29" Height="0.29" PrimitiveType="Cube" File=""/>
    </Models>
    <Geometries>
      <Structure Name="Body" Model="Truss3m" Matrix="{1,0,0}{0,1,0}{0,0,1}{0,0,0}" LinkedGeometry="" StructureType="Truss" CrossSectionType="Box"/>
    </Geometries>
    <DMXModes/>
  </FixtureType>
</GDTF>`;
}

// ─── Scene XML builder ────────────────────────────────────────────────────────

/**
 * Construct GeneralSceneDescription.xml for a simple concert rig:
 *
 *   Stage coordinates (MVR Z-up, mm):
 *     - Audience at +Y, stage at -Y
 *     - Stage width along X axis
 *     - Rig height along Z axis
 *
 *   Layout:
 *     Front Truss:  Z=6000 (6 m up), centred, 9 m wide
 *     Mid Truss:    Z=6500, -3 m back (Y=-3000)
 *     Rear Truss:   Z=7000, -6 m back (Y=-6000)
 */
function buildSceneXml(): string {
  const fixtures: string[] = [];
  let fixtureNum = 1;
  let universe = 1;
  let address = 1;

  // Helper: make a 4×4 MVR matrix string at the given position
  function matrix(x: number, y: number, z: number, rotZ = 0): string {
    const c = Math.cos(rotZ);
    const s = Math.sin(rotZ);
    // MVR matrix: {u=right}{v=forward}{w=up}{o=origin mm}
    // Identity (no rotation): u={1,0,0} v={0,1,0} w={0,0,1}
    // Z-rotation by rotZ: u rotates in XY plane, v follows, w stays vertical
    return `{${c},${s},0}{${-s},${c},0}{0,0,1}{${x},${y},${z}}`;
  }

  function makeFixture(
    name: string,
    gdtfSpec: string,
    gdtfMode: string,
    x: number, y: number, z: number,
    rotZ = 0,
  ): string {
    const uuid = crypto.randomUUID();
    const addr = `${universe}.${address}`;
    address += 16;
    if (address > 512) { address = 1; universe++; }
    const id = fixtureNum++;
    return `
        <Fixture name="${name}" uuid="${uuid}">
          <Matrix>${matrix(x, y, z, rotZ)}</Matrix>
          <GDTFSpec>${gdtfSpec}</GDTFSpec>
          <GDTFMode>${gdtfMode}</GDTFMode>
          <Addresses>
            <Address break="1">${addr}</Address>
          </Addresses>
          <FixtureID>${id}</FixtureID>
          <UnitNumber>${id}</UnitNumber>
          <CIEColor>0.313, 0.329, 100.0</CIEColor>
          <CustomId>${id}</CustomId>
        </Fixture>`;
  }

  function makeTruss(name: string, x: number, y: number, z: number): string {
    const uuid = crypto.randomUUID();
    return `
        <Truss name="${name}" uuid="${uuid}">
          <Matrix>${matrix(x, y, z)}</Matrix>
          <GDTFSpec>DemoTruss@Truss290</GDTFSpec>
          <GDTFMode>Default</GDTFMode>
          <Function>Lighting Truss</Function>
        </Truss>`;
  }

  // ── Front Truss (9 m wide at Z=6 m, Y=0)
  const trussNodes: string[] = [];
  trussNodes.push(makeTruss('Front Truss L', -4500, 0, 6000));
  trussNodes.push(makeTruss('Front Truss C', -1500, 0, 6000));
  trussNodes.push(makeTruss('Front Truss R', 1500, 0, 6000));

  // 6 moving heads on front truss, pointing straight down (rotZ for variety)
  const frontPositions = [-4000, -2500, -1200, 0, 1200, 2500, 4000];
  frontPositions.forEach((x, i) => {
    fixtures.push(
      makeFixture(`MH ${i + 1}`, 'DemoCo@MovingHead', 'Default', x, 0, 6000),
    );
  });

  // ── Mid Truss (6 m wide at Z=6.5 m, Y=-3 m)
  trussNodes.push(makeTruss('Mid Truss L', -3000, -3000, 6500));
  trussNodes.push(makeTruss('Mid Truss R', 0, -3000, 6500));

  // 4 moving heads on mid truss
  [-2500, -800, 800, 2500].forEach((x, i) => {
    fixtures.push(
      makeFixture(`MH Mid ${i + 1}`, 'DemoCo@MovingHead', 'Default', x, -3000, 6500),
    );
  });

  // ── Rear Truss (6 m wide at Z=7 m, Y=-6 m)
  trussNodes.push(makeTruss('Rear Truss L', -3000, -6000, 7000));
  trussNodes.push(makeTruss('Rear Truss R', 0, -6000, 7000));

  // 6 PAR fixtures on rear truss
  [-2500, -1500, -500, 500, 1500, 2500].forEach((x, i) => {
    fixtures.push(
      makeFixture(`PAR ${i + 1}`, 'DemoCo@PARFixture', 'Default', x, -6000, 7000),
    );
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<GeneralSceneDescription verMajor="1" verMinor="6" provider="GDTF Viewer Demo" providerVersion="1.0.0">
  <UserData/>
  <Scene>
    <AUXData>
      <Symdef/>
      <Positions/>
      <MappingDefinitions/>
      <Classes/>
    </AUXData>
    <Layers>
      <Layer name="Trusses" uuid="${crypto.randomUUID()}">
        <ChildList>
          ${trussNodes.join('')}
        </ChildList>
      </Layer>
      <Layer name="Fixtures" uuid="${crypto.randomUUID()}">
        <ChildList>
          ${fixtures.join('')}
        </ChildList>
      </Layer>
    </Layers>
  </Scene>
</GeneralSceneDescription>`;
}
